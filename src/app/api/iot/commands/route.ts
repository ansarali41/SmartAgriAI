// PHASE 7: Device command queue for ESP32/simulator polling and acknowledgements.
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateDevice } from "@/lib/device-auth";
import { acknowledgePumpCommand, claimDeviceCommands } from "@/lib/device-commands";
import { prisma } from "@/lib/db";
import { DEVICE_ACTIONS, isActionLive } from "@/lib/device-actions";

export const runtime = "nodejs";

const ackSchema = z.object({
  deviceId: z.string().min(1).optional(),
  hardwareId: z.string().min(1).optional(),
  commandId: z.string().min(1),
  kind: z.enum(["delivery", "execution"]).default("execution"),
  success: z.boolean().default(true),
  error: z.string().optional(),
});

const actionAckSchema = z.object({
  hardwareId: z.string().min(1).optional(),
  action: z.enum(DEVICE_ACTIONS),
  kind: z.literal("action"),
});

export async function GET(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) {
    return NextResponse.json({ error: "Invalid device or key" }, { status: 401 });
  }

  const commands = await claimDeviceCommands(device.id);

  // A remote action (restart, Wi-Fi reset, sleep, factory reset) queued from the app.
  const pending = await prisma.device.findUnique({ where: { id: device.id }, select: { pendingAction: true, pendingActionAt: true } });
  let action: string | null = null;
  if (pending?.pendingAction) {
    if (isActionLive(pending.pendingAction, pending.pendingActionAt)) action = pending.pendingAction;
    else await prisma.device.update({ where: { id: device.id }, data: { pendingAction: null, pendingActionAt: null } });
  }

  return NextResponse.json({
    success: true,
    action,
    commands: commands.map((command) => ({ id: command.id, deviceId: command.deviceId, potId: command.potId, command: command.command, mode: command.mode, sequence: command.sequence, expiresAt: command.expiresAt, status: "SENT" })),
  });
}

export async function POST(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) {
    return NextResponse.json({ error: "Invalid device or key" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // The board confirms a remote action just before carrying it out.
  const actionAck = actionAckSchema.safeParse(body);
  if (actionAck.success) {
    const current = await prisma.device.findUnique({ where: { id: device.id }, select: { pendingAction: true } });
    if (current?.pendingAction !== actionAck.data.action) {
      return NextResponse.json({ error: "No such action pending" }, { status: 409 });
    }
    if (actionAck.data.action === "FACTORY_RESET") {
      // The board is wiping its Wi-Fi and key; remove it from the account so it can be added fresh.
      await prisma.device.delete({ where: { id: device.id } });
    } else {
      await prisma.device.update({ where: { id: device.id }, data: { pendingAction: null, pendingActionAt: null } });
    }
    return NextResponse.json({ success: true });
  }

  const parsed = ackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid command acknowledgement" }, { status: 400 });
  }

  try {
    const result = await acknowledgePumpCommand({
      commandId: parsed.data.commandId,
      deviceId: device.id,
      kind: parsed.data.kind,
      success: parsed.data.success,
      error: parsed.data.error,
    });
    return NextResponse.json({ success: true, command: result.command });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command not found";
    return NextResponse.json(
      { error: message },
      { status: message === "Command not found" ? 404 : 409 },
    );
  }
}
