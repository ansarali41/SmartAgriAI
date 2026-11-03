// TASK: Add a pot together with its plant (both required) in one transaction,
// seeding the plant's comfort thresholds from the plant catalog when known.
// Optionally connect a sensor: an existing device in the garden, or a new one
// registered here (its one-time key is returned, as in /api/devices).
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { generateDeviceKey } from "@/lib/device-key";
import { findPlantProfile } from "@/lib/plant-catalog";

const percent = z.number().min(0).max(100);

const deviceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), deviceId: z.string().trim().min(1) }),
  z.object({
    mode: z.literal("new"),
    name: z.string().trim().min(1).max(80),
    hardwareId: z.string().trim().min(1).max(80),
    type: z
      .enum(["esp32_node", "dht22", "dht11", "soil_moisture", "rain", "ldr", "water_flow", "solenoid_valve", "camera"])
      .default("esp32_node"),
  }),
]);

const schema = z
  .object({
    pot: z.object({
      label: z.string().trim().min(1).max(60),
      soilType: z.enum(["loam", "clay", "sandy", "silt", "peat", "potting_mix"]),
      sizeCm: z.number().positive().max(1000).optional(),
      position: z.string().trim().max(120).optional(),
      moistureOnThreshold: percent,
      moistureOffThreshold: percent,
    }),
    plant: z.object({
      commonName: z.string().trim().min(1).max(80),
      variety: z.string().trim().max(80).optional(),
      growthStage: z
        .enum(["seedling", "vegetative", "flowering", "fruiting", "mature", "harvested"])
        .default("seedling"),
      plantedAt: z.string().datetime().optional(),
    }),
    device: deviceSchema.optional(),
  })
  .refine((data) => data.pot.moistureOnThreshold < data.pot.moistureOffThreshold, {
    message: "“Start watering below” must be lower than “Stop watering at”.",
    path: ["pot", "moistureOffThreshold"],
  });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;
  const { id: gardenId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues.find((issue) => issue.path.includes("moistureOffThreshold"))?.message;
    return NextResponse.json({ error: message ?? "Invalid pot or plant data" }, { status: 400 });
  }
  const garden = await prisma.garden.findFirst({ where: { id: gardenId, userId }, select: { id: true } });
  if (!garden) return NextResponse.json({ error: "Garden not found" }, { status: 404 });

  const { pot, plant, device } = parsed.data;
  const profile = findPlantProfile(plant.commonName);

  if (device?.mode === "existing") {
    const existing = await prisma.device.findFirst({
      where: { id: device.deviceId, userId, gardenId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "That device isn't in this garden" }, { status: 400 });
  }
  const newKey = device?.mode === "new" ? generateDeviceKey() : null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const newPot = await tx.pot.create({
        data: { ...pot, userId, gardenId },
      });
      const newPlant = await tx.plant.create({
        data: {
          userId,
          gardenId,
          potId: newPot.id,
          commonName: profile?.name ?? plant.commonName,
          scientificName: profile?.scientificName,
          variety: plant.variety || undefined,
          growthStage: plant.growthStage,
          plantedAt: plant.plantedAt ? new Date(plant.plantedAt) : null,
          threshold: {
            create: {
              soilMoistureMin: pot.moistureOnThreshold,
              soilMoistureMax: pot.moistureOffThreshold,
              ...(profile
                ? {
                    tempDayMin: profile.tempC[0],
                    tempDayMax: profile.tempC[1],
                    humidityMin: profile.humidity[0],
                    humidityMax: profile.humidity[1],
                  }
                : {}),
            },
          },
        },
      });

      let connectedDevice: { id: string; name: string; hardwareId: string } | null = null;
      if (device) {
        connectedDevice =
          device.mode === "existing"
            ? await tx.device.findUniqueOrThrow({
                where: { id: device.deviceId },
                select: { id: true, name: true, hardwareId: true },
              })
            : await tx.device.create({
                data: {
                  userId,
                  gardenId,
                  name: device.name,
                  hardwareId: device.hardwareId,
                  type: device.type,
                  apiKeyHash: newKey!.hash,
                },
                select: { id: true, name: true, hardwareId: true },
              });
        await tx.devicePotMapping.create({ data: { deviceId: connectedDevice.id, potId: newPot.id } });
      }
      return { pot: newPot, plant: newPlant, device: connectedDevice };
    });
    // The plaintext key is returned exactly once — store it on the device.
    return NextResponse.json({ ...created, deviceKey: newKey?.plain ?? null }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      if (target.includes("hardwareId")) {
        return NextResponse.json({ error: "A device with this hardware ID already exists." }, { status: 409 });
      }
      return NextResponse.json(
        { error: `A pot named "${pot.label}" already exists in this garden.` },
        { status: 409 },
      );
    }
    console.error("Planting create error:", error);
    return NextResponse.json({ error: "Failed to add pot and plant" }, { status: 500 });
  }
}
