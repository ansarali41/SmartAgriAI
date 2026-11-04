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
import { pickPotForReading } from "@/lib/device-pot";
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

const potReadingSchema = z
  .object({
    potId: z.string().min(1),
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

async function resolvePotId(
  input: PotReadingInput,
  device: { id: string; userId: string; gardenId: string },
) {
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

    await prisma.devicePotMapping.upsert({ where: { deviceId_potId: { deviceId: device.id, potId: pot.id } }, update: {}, create: { deviceId: device.id, potId: pot.id } });
    return pot.id;
  }

  const [mappings, pots] = await Promise.all([
    prisma.devicePotMapping.findMany({
      where: { deviceId: device.id, pot: { userId: device.userId, gardenId: device.gardenId } },
      select: { potId: true },
      take: 2,
    }),
    prisma.pot.findMany({
      where: { userId: device.userId, gardenId: device.gardenId, status: "active" },
      select: { id: true },
      take: 2,
    }),
  ]);
  const potId = pickPotForReading({
    mappedPotIds: mappings.map((mapping) => mapping.potId),
    gardenPotIds: pots.map((pot) => pot.id),
  });
  if (potId) {
    await prisma.devicePotMapping.upsert({ where: { deviceId_potId: { deviceId: device.id, potId } }, update: {}, create: { deviceId: device.id, potId } });
    return potId;
  }
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
    if (!found.gardenId || !found.garden) {
      await prisma.device.update({ where: { id: found.id }, data: { lastSeenAt: new Date(), status: "ONLINE" } });
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
    for (const input of potInputs) {
      let potId: string;
      try {
        potId = await resolvePotId(input, device);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid pot" },
          { status: 400 },
        );
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
    await prisma.$transaction(async (tx) => {
      await tx.reading.createMany({ data });
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
    });
  } catch (error) {
    console.error("IoT ingest error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
