// TASK: Domain CRUD — Plants (crops tracked for growth stage + health status).
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { searchParams } = new URL(req.url);
  const gardenId = searchParams.get("gardenId") || undefined;

  const plants = await prisma.plant.findMany({
    where: { userId: gate, ...(gardenId ? { gardenId } : {}) },
    orderBy: { updatedAt: "desc" },
    include: {
      garden: { select: { name: true } },
      pot: {
        select: {
          id: true,
          label: true,
          soilType: true,
          moistureOnThreshold: true,
          moistureOffThreshold: true,
        },
      },
    },
  });
  return NextResponse.json(plants);
}

const schema = z.object({
  gardenId: z.string().min(1),
  potId: z.string().min(1),
  commonName: z.string().min(1),
  scientificName: z.string().optional(),
  variety: z.string().optional(),
  plantedAt: z.string().datetime().optional(),
  growthStage: z
    .enum(["seedling", "vegetative", "flowering", "fruiting", "mature", "harvested"])
    .default("seedling"),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid plant data" }, { status: 400 });
    }
    const garden = await prisma.garden.findFirst({
      where: { id: parsed.data.gardenId, userId },
    });
    if (!garden) {
      return NextResponse.json({ error: "Garden not found" }, { status: 404 });
    }
    const pot = await prisma.pot.findFirst({
      where: {
        id: parsed.data.potId,
        gardenId: parsed.data.gardenId,
        userId,
      },
      include: { plant: { select: { id: true } } },
    });
    if (!pot) {
      return NextResponse.json(
        { error: "Pot not found for selected garden" },
        { status: 400 },
      );
    }
    if (pot.plant) {
      return NextResponse.json(
        { error: "Pot already has a plant" },
        { status: 409 },
      );
    }

    const { plantedAt, ...rest } = parsed.data;
    const plant = await prisma.plant.create({
      data: {
        ...rest,
        userId,
        plantedAt: plantedAt ? new Date(plantedAt) : null,
      },
    });
    return NextResponse.json(plant, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Pot already has a plant" },
        { status: 409 },
      );
    }
    console.error("Plant create error:", error);
    return NextResponse.json({ error: "Failed to create plant" }, { status: 500 });
  }
}
