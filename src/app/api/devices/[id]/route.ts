// TASK: Domain CRUD — Device update (PATCH: rename / place in a garden and
// pot, or take out of one) and delete (DELETE) by id.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { otherDeviceOnPot } from "@/lib/device-claim";

const schema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    // null = not in a garden (yet); the device stays registered.
    gardenId: z.string().trim().min(1).nullable().optional(),
    // null = not connected to a pot. One board serves one pot.
    potId: z.string().trim().min(1).nullable().optional(),
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid device update" }, { status: 400 });
  const device = await prisma.device.findFirst({ where: { id, userId: gate }, select: { id: true, gardenId: true } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const { name, potId } = parsed.data;
  const gardenId = parsed.data.gardenId === undefined ? device.gardenId : parsed.data.gardenId;
  if (gardenId) {
    const garden = await prisma.garden.findFirst({ where: { id: gardenId, userId: gate }, select: { id: true } });
    if (!garden) return NextResponse.json({ error: "Garden not found" }, { status: 404 });
  }
  if (potId) {
    if (!gardenId) return NextResponse.json({ error: "Choose the pot's garden too" }, { status: 400 });
    const pot = await prisma.pot.findFirst({ where: { id: potId, userId: gate, gardenId }, select: { id: true } });
    if (!pot) return NextResponse.json({ error: "Pot not found in this garden" }, { status: 400 });
    const occupant = await otherDeviceOnPot(potId, id);
    if (occupant) {
      return NextResponse.json({ error: `This pot already has a sensor (${occupant}). Disconnect it first.` }, { status: 409 });
    }
  }

  const gardenChanged = gardenId !== device.gardenId;
  await prisma.$transaction(async (tx) => {
    await tx.device.update({ where: { id }, data: { ...(name ? { name } : {}), gardenId } });
    // Moving gardens (or setting a pot) replaces the pot connection.
    if (gardenChanged || potId !== undefined) await tx.devicePotMapping.deleteMany({ where: { deviceId: id } });
    if (potId) await tx.devicePotMapping.create({ data: { deviceId: id, potId } });
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const device = await prisma.device.findFirst({
    where: { id, userId: gate },
    select: { id: true },
  });
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  await prisma.device.delete({ where: { id: device.id } });
  return NextResponse.json({ success: true });
}
