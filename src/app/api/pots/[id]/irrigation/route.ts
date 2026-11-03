// PHASE 6: Per-pot irrigation configuration and logical pump state.
// Backend-owned only: this stores decisions/config, but does not deliver ESP32 commands.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { findPotDevice, pumpStateToCommand, queuePumpCommand } from "@/lib/device-commands";
import { decidePotIrrigation, validatePotIrrigationThresholds } from "@/lib/irrigation";

const FRESH_MOISTURE_WINDOW_MS = 10 * 60 * 1000;

const schema = z
  .object({
    irrigationMode: z.enum(["AUTO", "MANUAL"]).optional(),
    moistureOnThreshold: z.number().min(0).max(100).optional(),
    moistureOffThreshold: z.number().min(0).max(100).optional(),
  })
  .strict();

async function getPot(id: string, userId: string) {
  return prisma.pot.findFirst({
    where: { id, userId },
    select: {
      id: true,
      gardenId: true,
      label: true,
      irrigationMode: true,
      moistureOnThreshold: true,
      moistureOffThreshold: true,
      pumpState: true,
      readings: {
        where: { metric: "soil_moisture" },
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: { value: true, recordedAt: true },
      },
      plant: { select: { id: true, commonName: true } },
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const pot = await getPot(id, gate);
  if (!pot) {
    return NextResponse.json({ error: "Pot not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, pot });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid irrigation config" }, { status: 400 });
  }

  const { id } = await params;
  const pot = await getPot(id, gate);
  if (!pot) {
    return NextResponse.json({ error: "Pot not found" }, { status: 404 });
  }

  const nextOnThreshold =
    parsed.data.moistureOnThreshold ?? pot.moistureOnThreshold;
  const nextOffThreshold =
    parsed.data.moistureOffThreshold ?? pot.moistureOffThreshold;

  if (!validatePotIrrigationThresholds(nextOnThreshold, nextOffThreshold)) {
    return NextResponse.json(
      { error: "moistureOnThreshold must be less than moistureOffThreshold" },
      { status: 400 },
    );
  }

  const nextMode = parsed.data.irrigationMode ?? pot.irrigationMode;
  const updated = await prisma.pot.update({
    where: { id: pot.id },
    data: parsed.data,
    select: {
      id: true,
      gardenId: true,
      label: true,
      irrigationMode: true,
      moistureOnThreshold: true,
      moistureOffThreshold: true,
      pumpState: true,
      plant: { select: { id: true, commonName: true } },
    },
  });

  let autoDecision:
    | { state: "not-evaluated" | "no-change" | "queued" | "deferred"; message: string }
    | undefined;
  const shouldEvaluateAuto =
    nextMode === "AUTO" &&
    (parsed.data.irrigationMode !== undefined ||
      parsed.data.moistureOnThreshold !== undefined ||
      parsed.data.moistureOffThreshold !== undefined);

  if (shouldEvaluateAuto) {
    const latestMoisture = pot.readings[0];
    if (!latestMoisture) {
      autoDecision = { state: "not-evaluated", message: "AUTO enabled; waiting for a soil-moisture reading." };
    } else if (Date.now() - latestMoisture.recordedAt.getTime() > FRESH_MOISTURE_WINDOW_MS) {
      autoDecision = { state: "not-evaluated", message: "AUTO enabled; latest soil-moisture reading is stale." };
    } else {
      const decision = decidePotIrrigation({
        moisture: latestMoisture.value,
        config: updated,
      });
      if (!decision.changed) {
        autoDecision = { state: "no-change", message: decision.message };
      } else {
        const device = await findPotDevice(updated.id, updated.gardenId, gate);
        const isOnline =
          device?.status === "ONLINE" &&
          device.lastSeenAt != null &&
          Date.now() - device.lastSeenAt.getTime() <= FRESH_MOISTURE_WINDOW_MS;
        if (!device || !isOnline) {
          autoDecision = {
            state: "deferred",
            message: "AUTO decision is ready but no online ESP32 is available; it will retry on fresh telemetry.",
          };
        } else {
          const queued = await queuePumpCommand({
            userId: gate,
            gardenId: updated.gardenId,
            deviceId: device.id,
            potId: updated.id,
            command: pumpStateToCommand(decision.pumpState),
            mode: "AUTO",
            decisionMoisture: latestMoisture.value,
            onThreshold: updated.moistureOnThreshold,
            offThreshold: updated.moistureOffThreshold,
          });
          autoDecision = {
            state: queued.blocked ? "deferred" : "queued",
            message: queued.blocked
              ? "AUTO decision is waiting for the current device command to be acknowledged."
              : queued.created
              ? `${decision.message} Command queued; pump state changes after acknowledgement.`
              : "An identical AUTO command is already awaiting acknowledgement.",
          };
        }
      }
    }
  }

  if (parsed.data.irrigationMode) {
    await prisma.irrigationEvent.create({
      data: {
        userId: gate,
        gardenId: updated.gardenId,
        potId: updated.id,
        mode: updated.irrigationMode === "MANUAL" ? "manual" : "automatic",
        status: updated.pumpState,
        manualOverride: updated.irrigationMode === "MANUAL",
        reason: parsed.data.irrigationMode
          ? `Irrigation mode set to ${updated.irrigationMode}`
          : "Per-pot irrigation configuration updated",
      },
    });
  }

  return NextResponse.json({ success: true, pot: updated, autoDecision });
}
