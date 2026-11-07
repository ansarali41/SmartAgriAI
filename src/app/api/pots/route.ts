// TASK: Domain CRUD — Pots (physical containers inside a garden).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { nextPotNumber, potCode } from "@/lib/pot-number";
import { getDeviceConnectionStatus } from "@/lib/device-status";

export async function GET(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { searchParams } = new URL(req.url);
  const gardenId = searchParams.get("gardenId") || undefined;
  const availableForPlant = searchParams.get("availableForPlant") === "true";
  const currentPlantId = searchParams.get("currentPlantId") || undefined;

  const pots = await prisma.pot.findMany({
    where: {
      userId: gate,
      ...(gardenId ? { gardenId } : {}),
      ...(availableForPlant
        ? {
            OR: [
              { plant: null },
              ...(currentPlantId ? [{ plant: { id: currentPlantId } }] : []),
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      garden: { select: { name: true } },
      plant: { select: { id: true, commonName: true, healthStatus: true, growthStage: true } },
      _count: { select: { deviceMappings: true } },
      deviceMappings: { select: { port: true, device: { select: { id: true, name: true, lastSeenAt: true } } }, orderBy: { createdAt: "asc" } },
      readings: {
        where: { metric: "soil_moisture" },
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: { value: true, recordedAt: true },
      },
      deviceCommands: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, command: true, status: true, error: true, createdAt: true, deliveryAcknowledgedAt: true, executionResultAt: true, sequence: true },
      },
    },
  });
  const now = new Date();
  return NextResponse.json(
    pots.map(({ readings, deviceCommands, deviceMappings, ...pot }) => ({
      ...pot,
      // The device connected to this pot and the port of it the pot uses.
      sensors: deviceMappings.map(({ device, port }) => ({
        id: device.id,
        name: device.name,
        port,
        status: getDeviceConnectionStatus(device.lastSeenAt, now),
      })),
      currentMoisture: readings[0]?.value ?? null,
      moistureRecordedAt: readings[0]?.recordedAt ?? null,
      latestCommand: deviceCommands[0] ?? null,
    })),
  );
}

const schema = z.object({
  gardenId: z.string().min(1),
  label: z.string().trim().max(60).optional(),
  sizeCm: z.number().optional(),
  soilType: z
    .enum(["loam", "clay", "sandy", "silt", "peat", "potting_mix"])
    .default("loam"),
  position: z.string().optional(),
});

export async function POST(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid pot data" }, { status: 400 });
    }
    // Ensure the garden belongs to the user.
    const garden = await prisma.garden.findFirst({
      where: { id: parsed.data.gardenId, userId },
    });
    if (!garden) {
      return NextResponse.json({ error: "Garden not found" }, { status: 404 });
    }
    const pot = await prisma.$transaction(async (tx) => {
      const number = await nextPotNumber(tx, userId);
      return tx.pot.create({ data: { ...parsed.data, label: parsed.data.label || potCode(number), number, userId } });
    });
    return NextResponse.json(pot, { status: 201 });
  } catch (error) {
    console.error("Pot create error:", error);
    return NextResponse.json({ error: "Failed to create pot" }, { status: 500 });
  }
}
