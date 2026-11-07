// ============================================================================
// PHASE 5: Pot-level soil moisture + garden-level temperature ingest.
// WHAT: ESP32 devices POST authenticated telemetry here. Soil moisture belongs
//       to a Pot in the same Garden as the Device; temperature stays Garden-wide.
// ============================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashDeviceKey } from "@/lib/device-key";
import { pumpStateToCommand, queuePumpCommand } from "@/lib/device-commands";
import { decidePotIrrigation } from "@/lib/irrigation";
import { formatDeviceRecoveredNotification } from "@/lib/business-notifications";
import { enqueueTelegramDelivery } from "@/lib/telegram-delivery-enqueue";
import { deviceRecoveryEventKey } from "@/lib/device-monitoring";
import { createAppNotification } from "@/lib/notify";
import { MAX_PORTS, pickPotForReading } from "@/lib/device-pot";
import type { Metric, Prisma } from "@prisma/client";

const metricObjectSchema = z
  .object({
    soil_moisture: z.number().min(0).max(100).optional(),
    temperature: z.number().optional(),
    humidity: z.number().optional(),
    rain: z.number().optional(),
    light: z.number().optional(),
  })
  .passthrough();

const portSchema = z.number().int().min(1).max(MAX_PORTS);

const potReadingSchema = z
  .object({
    // A multi-pot board sends its port; the simulator / older clients may send potId.
    potId: z.string().min(1).optional(),
    port: portSchema.optional(),
    soilMoisture: z.number().min(0).max(100).optional(),
    soil_moisture: z.number().min(0).max(100).optional(),
    moisture: z.number().min(0).max(100).optional(),
    pump: z.boolean().optional(),
  })
  .passthrough();

const bodySchema = z
  .object({
    hardwareId: z.string().min(1).optional(),
    deviceId: z.string().min(1).optional(),
    potId: z.string().min(1).optional(),
    port: portSchema.optional(),
    // How many ports (pots) this board serves — firmware 2.7+.
    ports: portSchema.optional(),
    // e.g. "smartagri-2.9" — shown in the app, and tells it whether ports can be set remotely.
    firmware: z.string().trim().max(40).optional(),
    soilMoisture: z.number().min(0).max(100).optional(),
    // Canonical wire format. Keep soilMoisture for deployed legacy clients.
    soil_moisture: z.number().min(0).max(100).optional(),
    temperature: z.number().optional(),
    humidity: z.number().optional(),
    rain: z.number().optional(),
    light: z.number().optional(),
    pump: z.boolean().optional(),
    readings: z.union([metricObjectSchema, z.array(potReadingSchema)]).optional(),
    recordedAt: z.string().datetime().optional(),
  })
  .passthrough()
  .refine((body) => body.hardwareId || body.deviceId, {
    message: "hardwareId or deviceId is required",
  });

const UNITS: Partial<Record<Metric, string>> = {
  soil_moisture: "%",
  temperature: "C",
  humidity: "%",
  rain: "%",
  light: "lux",
  valve_state: "boolean",
};

// Automatic actions are based only on recent readings. We still retain stale
// telemetry for diagnostics, but it cannot change a relay state.
const FRESH_MOISTURE_WINDOW_MS = 10 * 60 * 1000;
const FUTURE_READING_TOLERANCE_MS = 60 * 1000;

function isFreshMoistureReading(recordedAt: Date) {
  const ageMs = Date.now() - recordedAt.getTime();
  return ageMs >= -FUTURE_READING_TOLERANCE_MS && ageMs <= FRESH_MOISTURE_WINDOW_MS;
}

type PotReadingInput = {
  potId?: string;
  port?: number;
  soilMoisture?: number;
  pump?: boolean;
};

function normalizeMoisture(value: number) {
  return value <= 1 ? Math.round(value * 100) : value;
}

function getObjectReadings(readings: unknown) {
  return readings && !Array.isArray(readings) ? readings : undefined;
}

function getPotReadingMoisture(reading: z.infer<typeof potReadingSchema>) {
  return reading.soilMoisture ?? reading.soil_moisture ?? reading.moisture;
}

/** What each port reported (probe reading or null, pump state) — shown on the Devices page. */
function getPortStatus(readings: unknown) {
  if (!Array.isArray(readings)) return null;
  const ports = (readings as z.infer<typeof potReadingSchema>[])
    .filter((r) => r.port !== undefined)
    .map((r) => {
      const moisture = getPotReadingMoisture(r);
      return { port: r.port!, moisture: moisture === undefined ? null : normalizeMoisture(moisture), pump: r.pump ?? null };
    })
    .sort((a, b) => a.port - b.port);
  return ports.length ? ports : null;
}

/** The pot a reading belongs to; null = it came from a port that isn't connected (skip it). */
async function resolvePotId(
  input: PotReadingInput,
  device: { id: string; userId: string; gardenId: string },
): Promise<string | null> {
  if (input.potId) {
    const pot = await prisma.pot.findFirst({
      where: {
        userId: device.userId,
        gardenId: device.gardenId,
        OR: [{ id: input.potId }, { label: input.potId }],
      },
      select: { id: true },
    });

    if (!pot) {
      throw new Error(`Invalid pot/device combination for potId ${input.potId}`);
    }

    // Readings may name a pot (multi-pot nodes, the simulator), but only a pot
    // the user connected this device to in the app. Never link automatically.
    const connected = await prisma.devicePotMapping.findUnique({
      where: { deviceId_potId: { deviceId: device.id, potId: pot.id } },
      select: { id: true },
    });
    if (!connected) {
      throw new Error(`potId ${input.potId} isn't connected to this device. Connect it to the pot in the app first.`);
    }
    return pot.id;
  }

  const links = await prisma.devicePotMapping.findMany({
    where: { deviceId: device.id, pot: { userId: device.userId, gardenId: device.gardenId } },
    select: { potId: true, port: true },
  });
  const potId = pickPotForReading({ links, port: input.port });
  if (potId || input.port !== undefined) return potId;
  throw new Error("potId is required for soil moisture readings: connect this device to one pot or send potId");
}

async function getPotIrrigationConfig(
  potId: string,
  device: { userId: string; gardenId: string },
) {
  return prisma.pot.findFirst({
    where: { id: potId, userId: device.userId, gardenId: device.gardenId },
    select: {
      id: true,
      irrigationMode: true,
      moistureOnThreshold: true,
      moistureOffThreshold: true,
      pumpState: true,
    },
  });
}

export async function POST(req: Request) {
  try {
    const key = req.headers.get("x-device-key");
    if (!key) {
      return NextResponse.json({ error: "Missing device key" }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 },
      );
    }

    const hardwareId = parsed.data.hardwareId ?? parsed.data.deviceId;
    if (!hardwareId) {
      return NextResponse.json(
        { error: "hardwareId or deviceId is required" },
        { status: 400 },
      );
    }

    const found = await prisma.device.findUnique({
      where: { hardwareId },
      select: {
        id: true,
        userId: true,
        gardenId: true,
        hardwareId: true,
        apiKeyHash: true,
        name: true,
        status: true,
        lastSeenAt: true,
        desiredPorts: true,
        firmwareVersion: true,
        garden: { select: { name: true } },
      },
    });

    if (!found || found.apiKeyHash !== hashDeviceKey(key)) {
      return NextResponse.json(
        { error: "Invalid device or key" },
        { status: 401 },
      );
    }

    // Added but not placed in a garden yet: show it as online, store nothing.
    const portStatus = getPortStatus(parsed.data.readings);
    if (!found.gardenId || !found.garden) {
      await prisma.device.update({
        where: { id: found.id },
        data: { lastSeenAt: new Date(), status: "ONLINE", ...(portStatus ? { portStatus } : {}), ...(parsed.data.ports && found.desiredPorts == null ? { portCount: parsed.data.ports } : {}), ...(parsed.data.firmware && parsed.data.firmware !== found.firmwareVersion ? { firmwareVersion: parsed.data.firmware } : {}) },
      });
      return NextResponse.json(
        { error: "This device isn't in a garden yet. Choose its garden and pot in the app.", unassigned: true },
        { status: 409 },
      );
    }
    const device = { ...found, gardenId: found.gardenId, garden: found.garden };

    const recordedAt = parsed.data.recordedAt
      ? new Date(parsed.data.recordedAt)
      : new Date();

    const objectReadings = getObjectReadings(parsed.data.readings) as
      | z.infer<typeof metricObjectSchema>
      | undefined;

    const gardenEntries: { metric: Metric; value: number }[] = [];
    const temperature = parsed.data.temperature ?? objectReadings?.temperature;
    const humidity = parsed.data.humidity ?? objectReadings?.humidity;
    const rain = parsed.data.rain ?? objectReadings?.rain;
    const light = parsed.data.light ?? objectReadings?.light;
    if (temperature !== undefined)
      gardenEntries.push({ metric: "temperature", value: temperature });
    if (humidity !== undefined)
      gardenEntries.push({ metric: "humidity", value: humidity });
    if (rain !== undefined) gardenEntries.push({ metric: "rain", value: rain });
    if (light !== undefined) gardenEntries.push({ metric: "light", value: light });

    const potInputs: PotReadingInput[] = [];
    const topLevelMoisture =
      parsed.data.soil_moisture ??
      parsed.data.soilMoisture ??
      objectReadings?.soil_moisture;
    if (topLevelMoisture !== undefined || parsed.data.pump !== undefined) {
      potInputs.push({
        potId: parsed.data.potId,
        port: parsed.data.port,
        soilMoisture: topLevelMoisture,
        pump: parsed.data.pump,
      });
    }

    if (Array.isArray(parsed.data.readings)) {
      for (const reading of parsed.data.readings) {
        const moisture = getPotReadingMoisture(reading);
        if (moisture !== undefined || reading.pump !== undefined) {
          potInputs.push({
            potId: reading.potId,
            port: reading.port,
            soilMoisture: moisture,
            pump: reading.pump,
          });
        }
      }
    }

    if (gardenEntries.length === 0 && potInputs.length === 0) {
      return NextResponse.json(
        { error: "At least one sensor reading is required" },
        { status: 400 },
      );
    }

    const data: Prisma.ReadingCreateManyInput[] = gardenEntries.map((entry) => ({
      userId: device.userId,
      gardenId: device.gardenId,
      potId: null,
      deviceId: device.id,
      hardwareId: device.hardwareId,
      metric: entry.metric,
      value: entry.value,
      unit: UNITS[entry.metric],
      recordedAt,
    }));
    const irrigationDecisions: {
      potId: string;
      mode: string;
      pumpState: string;
      changed: boolean;
      reason: string;
    }[] = [];
    const unconnectedPorts: number[] = [];
    for (const input of potInputs) {
      let potId: string | null;
      try {
        potId = await resolvePotId(input, device);
      } catch (error) {
        // Still online, just not connected to a pot: keep it from looking offline.
        await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), status: "ONLINE" } });
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid pot" },
          { status: 400 },
        );
      }
      if (!potId) {
        // A port with nothing connected yet: nothing to store for it.
        if (input.port !== undefined) unconnectedPorts.push(input.port);
        continue;
      }

      // The board is the source of truth for its relay. It switches the pump
      // OFF on every restart (and on communication loss), so if it reports a
      // state different from ours while no command is on its way, adopt it —
      // otherwise automatic mode would never re-issue PUMP_ON.
      if (input.pump !== undefined) {
        const reported = input.pump ? "on" : "off";
        const inFlight = await prisma.deviceCommand.count({
          where: { deviceId: device.id, potId, status: { in: ["PENDING", "SENT", "RETRYING"] } },
        });
        if (inFlight === 0) {
          await prisma.pot.updateMany({
            where: { id: potId, userId: device.userId, pumpState: { not: reported } },
            data: { pumpState: reported },
          });
        }
      }

      if (input.soilMoisture !== undefined) {
        const moisture = normalizeMoisture(input.soilMoisture);
        data.push({
          userId: device.userId,
          gardenId: device.gardenId,
          potId,
          deviceId: device.id,
          hardwareId: device.hardwareId,
          metric: "soil_moisture",
          value: moisture,
          unit: UNITS.soil_moisture,
          recordedAt,
        });

        const potConfig = await getPotIrrigationConfig(potId, device);
        if (potConfig) {
          if (!isFreshMoistureReading(recordedAt)) {
            irrigationDecisions.push({
              potId,
              mode: potConfig.irrigationMode,
              pumpState: potConfig.pumpState,
              changed: false,
              reason: "SOIL_MOISTURE_STALE",
            });
          } else {
            const decision = decidePotIrrigation({
              moisture,
              config: potConfig,
            });
            irrigationDecisions.push({
              potId,
              mode: decision.mode,
              pumpState: decision.pumpState,
              changed: decision.changed,
              reason: decision.reason,
            });

            if (decision.changed) {
              await queuePumpCommand({
                userId: device.userId,
                gardenId: device.gardenId,
                deviceId: device.id,
                potId,
                command: pumpStateToCommand(decision.pumpState),
                mode: "AUTO",
                decisionMoisture: moisture,
                onThreshold: potConfig.moistureOnThreshold,
                offThreshold: potConfig.moistureOffThreshold,
              });
            }
          }
        }
      }

      if (input.pump !== undefined) {
        data.push({
          userId: device.userId,
          gardenId: device.gardenId,
          potId,
          deviceId: device.id,
          hardwareId: device.hardwareId,
          metric: "valve_state",
          value: input.pump ? 1 : 0,
          unit: UNITS.valve_state,
          recordedAt,
        });
      }
    }

    const receivedAt = new Date();
    // A port count chosen in the app wins; the board catches up on its next poll.
    const reportedPorts = device.desiredPorts == null ? parsed.data.ports : undefined;
    await prisma.$transaction(async (tx) => {
      if (data.length) await tx.reading.createMany({ data });
      if (reportedPorts) {
        await tx.device.updateMany({ where: { id: device.id, portCount: { not: reportedPorts } }, data: { portCount: reportedPorts } });
      }
      if (portStatus || (parsed.data.firmware && parsed.data.firmware !== device.firmwareVersion)) {
        await tx.device.update({
          where: { id: device.id },
          data: { ...(portStatus ? { portStatus } : {}), ...(parsed.data.firmware ? { firmwareVersion: parsed.data.firmware } : {}) },
        });
      }
      // Check the current row inside the transaction rather than trusting the
      // earlier read: an offline-monitor invocation may have transitioned it
      // while this valid telemetry request was being prepared.
      const recovered = await tx.device.updateMany({
        where: { id: device.id, status: "OFFLINE" },
        data: { lastSeenAt: receivedAt, status: "ONLINE" },
      });
      if (recovered.count === 1 && device.lastSeenAt) {
        await enqueueTelegramDelivery(tx, {
          userId: device.userId,
          eventKey: deviceRecoveryEventKey(device.id, device.lastSeenAt),
          eventType: "DEVICE_RECOVERED",
          eventRef: device.id,
          messageText: formatDeviceRecoveredNotification({ deviceName: device.name, gardenName: device.garden.name, receivedAt }),
        });
        await createAppNotification(tx, {
          userId: device.userId,
          type: "info",
          severity: "low",
          title: `${device.name} is back online`,
          message: `${device.name} in ${device.garden.name} is sending data again.`,
          actionUrl: "/sensors",
        });
      } else if (recovered.count === 0) {
        // Valid, authenticated telemetry is a successful backend receipt.
        await tx.device.update({ where: { id: device.id }, data: { lastSeenAt: receivedAt, status: "ONLINE" } });
      }
    });

    return NextResponse.json({
      success: true,
      saved: data.length,
      soilReadings: data.filter((row) => row.metric === "soil_moisture").length,
      gardenReadings: gardenEntries.length,
      irrigation: irrigationDecisions,
      ...(unconnectedPorts.length ? { unconnectedPorts } : {}),
    });
  } catch (error) {
    console.error("IoT ingest error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
