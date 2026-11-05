import type { DeviceCommand, DeviceCommandType, IrrigationStatus, PotIrrigationMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getDeviceCommandSettings } from "@/lib/device-command-settings";
import { formatPumpAcknowledgementNotification, formatPumpFailureNotification } from "@/lib/business-notifications";
import { enqueueTelegramDelivery } from "@/lib/telegram-delivery-enqueue";
import { createAppNotification, potActionUrl } from "@/lib/notify";

export const pumpStateToCommand = (state: IrrigationStatus): DeviceCommandType => state === "on" ? "PUMP_ON" : "PUMP_OFF";
export const commandToPumpState = (command: DeviceCommandType): IrrigationStatus => command === "PUMP_ON" ? "on" : "off";

const DEVICE_SELECT = { id: true, gardenId: true, userId: true, hardwareId: true, status: true, lastSeenAt: true } as const;
// Postgres sorts NULL first for DESC; a never-seen device must not win.
const RECENTLY_SEEN_FIRST = [{ lastSeenAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }] as const;

export async function findGardenDevice(gardenId: string, userId: string) {
  return prisma.device.findFirst({ where: { gardenId, userId, type: "esp32_node" }, orderBy: [...RECENTLY_SEEN_FIRST], select: DEVICE_SELECT });
}

/**
 * The device that should receive a pot's pump commands: the one connected to
 * the pot (DevicePotMapping), most recently seen first. Falls back to the
 * garden's ESP32 only when no device is connected to the pot.
 */
export async function findPotDevice(potId: string, gardenId: string, userId: string) {
  const connected = await prisma.device.findFirst({
    where: { gardenId, userId, potMappings: { some: { potId } } },
    orderBy: [...RECENTLY_SEEN_FIRST],
    select: DEVICE_SELECT,
  });
  return connected ?? findGardenDevice(gardenId, userId);
}

export async function queuePumpCommand(input: { userId: string; gardenId: string; deviceId: string; potId: string; command: DeviceCommandType; mode: PotIrrigationMode; decisionMoisture?: number; onThreshold?: number; offThreshold?: number }) {
  const now = new Date(), settings = getDeviceCommandSettings();
  return prisma.$transaction(async (tx) => {
    const active = await tx.deviceCommand.findMany({ where: { deviceId: input.deviceId, potId: input.potId, status: { in: ["PENDING", "SENT", "RETRYING"] } }, orderBy: { sequence: "desc" } });
    const same = active.find((c) => c.command === input.command);
    if (same) return { command: same, created: false, blocked: false };
    const pendingOff = active.find((c) => c.command === "PUMP_OFF");
    if (input.command === "PUMP_ON" && pendingOff) return { command: pendingOff, created: false, blocked: true };
    await tx.deviceCommand.updateMany({ where: { deviceId: input.deviceId, potId: input.potId, status: { in: input.command === "PUMP_OFF" ? ["PENDING", "SENT", "RETRYING"] : ["PENDING", "RETRYING"] } }, data: { status: "CANCELLED", error: input.command === "PUMP_OFF" ? "Superseded by safety-priority PUMP_OFF" : "Superseded by newer pump command", processedAt: now } });
    // Incrementing the Pot row obtains a row lock, making sequences monotonic.
    const pot = await tx.pot.update({ where: { id: input.potId }, data: { commandSequence: { increment: 1 } }, select: { commandSequence: true } });
    const command = await tx.deviceCommand.create({ data: { ...input, sequence: pot.commandSequence, expiresAt: new Date(now.getTime() + settings.maxLifetimeMs), nextAttemptAt: now } });
    return { command, created: true, blocked: false };
  });
}

export async function claimDeviceCommands(deviceId: string, limit = 20, now = new Date()) {
  const s = getDeviceCommandSettings();
  await prisma.deviceCommand.updateMany({ where: { deviceId, status: { in: ["PENDING", "SENT", "RETRYING"] }, expiresAt: { lte: now } }, data: { status: "EXPIRED", error: "Command lifetime expired", processedAt: now } });
  await prisma.deviceCommand.updateMany({ where: { deviceId, status: "SENT", executionResultAt: null, lastAttemptAt: { lte: new Date(now.getTime() - s.ackTimeoutMs) }, attemptCount: { gte: s.maxAttempts } }, data: { status: "EXPIRED", error: "Execution acknowledgement timed out", processedAt: now } });
  await prisma.deviceCommand.updateMany({ where: { deviceId, status: "SENT", executionResultAt: null, lastAttemptAt: { lte: new Date(now.getTime() - s.ackTimeoutMs) }, attemptCount: { lt: s.maxAttempts }, expiresAt: { gt: now } }, data: { status: "RETRYING", nextAttemptAt: new Date(now.getTime() + s.retryIntervalMs) } });
  const candidates = await prisma.deviceCommand.findMany({ where: { deviceId, status: { in: ["PENDING", "RETRYING"] }, nextAttemptAt: { lte: now }, expiresAt: { gt: now } }, orderBy: [{ command: "desc" }, { sequence: "desc" }, { createdAt: "asc" }], take: Math.min(limit * 4, 80) });
  const commands: DeviceCommand[] = [], pots = new Set<string>();
  for (const c of candidates) {
    if (pots.has(c.potId)) continue;
    // Conditional update is the claim token: concurrent polls cannot both send it.
    const result = await prisma.deviceCommand.updateMany({ where: { id: c.id, status: { in: ["PENDING", "RETRYING"] }, nextAttemptAt: { lte: now }, expiresAt: { gt: now } }, data: { status: "SENT", sentAt: c.sentAt ?? now, lastAttemptAt: now, attemptCount: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + s.ackTimeoutMs) } });
    if (result.count) { commands.push({ ...c, status: "SENT", sentAt: c.sentAt ?? now, lastAttemptAt: now, attemptCount: c.attemptCount + 1, nextAttemptAt: new Date(now.getTime() + s.ackTimeoutMs) }); pots.add(c.potId); }
    if (commands.length === limit) break;
  }
  return commands;
}

export async function acknowledgePumpCommand(input: { commandId: string; deviceId: string; kind: "delivery" | "execution"; success?: boolean; error?: string }) {
  const command = await prisma.deviceCommand.findFirst({ where: { id: input.commandId, deviceId: input.deviceId } });
  if (!command) throw new Error("Command not found");
  const now = new Date();
  if (input.kind === "delivery") {
    const changed = await prisma.deviceCommand.updateMany({ where: { id: command.id, status: "SENT", deliveryAcknowledgedAt: null }, data: { deliveryAcknowledgedAt: now } });
    return { command: changed.count ? { ...command, deliveryAcknowledgedAt: now } : command, notification: null };
  }
  if (command.executionResultAt || ["ACKNOWLEDGED", "FAILED"].includes(command.status)) return { command, notification: null };
  if (command.status !== "SENT") throw new Error("Command has not been dispatched to this device");
  if (!input.success) return failCommand(command, input.error ?? "Device rejected command", now);
  return executeCommand(command, now);
}

async function failCommand(command: DeviceCommand, error: string, now: Date) {
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.deviceCommand.updateMany({ where: { id: command.id, status: "SENT", executionResultAt: null }, data: { status: "FAILED", error, processedAt: now, executionResultAt: now } });
    if (!changed.count) return command;
    const pot = await tx.pot.findUnique({ where: { id: command.potId }, select: { pumpState: true, label: true, garden: { select: { name: true } } } });
    if (pot) { await tx.pumpEvent.create({ data: { userId: command.userId, gardenId: command.gardenId, potId: command.potId, deviceId: command.deviceId, commandId: command.id, previousState: pot.pumpState, newState: commandToPumpState(command.command), source: command.mode, status: "FAILED", failureReason: error, occurredAt: now } }); await enqueueTelegramDelivery(tx, { userId: command.userId, eventKey: `pump:${command.id}:failed`, eventType: "PUMP_FAILED", eventRef: command.id, messageText: formatPumpFailureNotification({ gardenName: pot.garden.name, potLabel: pot.label, command: command.command, occurredAt: now, error }) });
      await createAppNotification(tx, { userId: command.userId, gardenId: command.gardenId, potId: command.potId, type: "alert", severity: "high", title: `Pump didn't turn ${command.command === "PUMP_ON" ? "on" : "off"} — ${pot.label}`, message: `${pot.garden.name}: the device couldn't apply the command (${error}). Check the board and relay, then try again.`, actionUrl: potActionUrl(command.gardenId, command.potId) }); }
    return { ...command, status: "FAILED" as const, executionResultAt: now };
  });
  return { command: updated, notification: { success: false as const, occurredAt: now } };
}

async function executeCommand(command: DeviceCommand, now: Date) {
  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.deviceCommand.updateMany({ where: { id: command.id, status: "SENT", executionResultAt: null }, data: { status: "ACKNOWLEDGED", error: null, processedAt: now, acknowledgedAt: now, executionResultAt: now } });
    if (!changed.count) return false;
    const pot = await tx.pot.findUniqueOrThrow({ where: { id: command.potId }, select: { pumpState: true, label: true, moistureOnThreshold: true, moistureOffThreshold: true, garden: { select: { name: true } } } });
    const applied = await tx.pot.updateMany({ where: { id: command.potId, confirmedCommandSequence: { lt: command.sequence } }, data: { pumpState: commandToPumpState(command.command), confirmedCommandSequence: command.sequence } });
    if (!applied.count) return false;
    const state = commandToPumpState(command.command);
    await tx.irrigationEvent.create({ data: { userId: command.userId, gardenId: command.gardenId, potId: command.potId, mode: command.mode === "MANUAL" ? "manual" : "automatic", status: state, manualOverride: command.mode === "MANUAL", reason: `${command.mode} command ${command.command} executed`, soilMoisture: command.decisionMoisture, onThreshold: command.onThreshold ?? pot.moistureOnThreshold, offThreshold: command.offThreshold ?? pot.moistureOffThreshold, decision: command.command, outcome: "EXECUTED" } });
    await tx.pumpEvent.create({ data: { userId: command.userId, gardenId: command.gardenId, potId: command.potId, deviceId: command.deviceId, commandId: command.id, previousState: pot.pumpState, newState: state, source: command.mode, status: "ACKNOWLEDGED", occurredAt: now } });
    await enqueueTelegramDelivery(tx, { userId: command.userId, eventKey: `pump:${command.id}:acknowledged`, eventType: "PUMP_ACKNOWLEDGED", eventRef: command.id, messageText: formatPumpAcknowledgementNotification({ gardenName: pot.garden.name, potLabel: pot.label, command: command.command, mode: command.mode, occurredAt: now, decisionMoisture: command.decisionMoisture }) });
    // Automatic watering is worth knowing about; manual on/off was the user's own action.
    if (command.mode === "AUTO" && command.command === "PUMP_ON") {
      await createAppNotification(tx, { userId: command.userId, gardenId: command.gardenId, potId: command.potId, type: "info", severity: "low", title: `Watering started — ${pot.label}`, message: `${pot.garden.name}: soil was ${command.decisionMoisture != null ? `${command.decisionMoisture}%` : "dry"}, below ${command.onThreshold ?? pot.moistureOnThreshold}%. The pump turned on automatically.`, actionUrl: potActionUrl(command.gardenId, command.potId) });
    }
    return true;
  });
  return { command: { ...command, status: "ACKNOWLEDGED" as const, executionResultAt: now }, notification: result ? { success: true as const, occurredAt: now } : null };
}
