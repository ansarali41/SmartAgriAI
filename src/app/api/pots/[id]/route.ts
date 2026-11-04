// TASK: Domain CRUD — Pot update (PATCH) / delete (DELETE) by id.
// Watering thresholds and mode are changed via /api/pots/[id]/irrigation.
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

const schema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    soilType: z.enum(["loam", "clay", "sandy", "silt", "peat", "potting_mix"]).optional(),
    sizeCm: z.number().positive().max(1000).nullable().optional(),
    position: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pot update" }, { status: 400 });
  }
  const data = { ...parsed.data, position: parsed.data.position === "" ? null : parsed.data.position };

  try {
    const result = await prisma.pot.updateMany({ where: { id, userId: gate }, data });
    if (result.count === 0) {
      return NextResponse.json({ error: "Pot not found" }, { status: 404 });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: `A pot named "${parsed.data.label}" already exists in this garden.` },
        { status: 409 },
      );
    }
    console.error("Pot update error:", error);
    return NextResponse.json({ error: "Failed to update pot" }, { status: 500 });
  }
  return NextResponse.json(await prisma.pot.findUnique({ where: { id } }));
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const result = await prisma.pot.deleteMany({ where: { id, userId: gate } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Pot not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
