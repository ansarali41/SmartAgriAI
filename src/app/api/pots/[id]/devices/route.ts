// TASK: Connect (POST) or disconnect (DELETE) a device and a pot. A device
// connected to exactly one pot has its soil-moisture readings recorded on that
// pot even when its payload carries no potId (see lib/device-pot).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { otherDeviceOnPot } from "@/lib/device-claim";

const schema = z.object({ deviceId: z.string().trim().min(1) });

async function resolve(req: Request, params: Promise<{ id: string }>) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id: potId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "deviceId is required" }, { status: 400 });

  const pot = await prisma.pot.findFirst({ where: { id: potId, userId: gate }, select: { id: true, gardenId: true } });
  if (!pot) return NextResponse.json({ error: "Pot not found" }, { status: 404 });

  const device = await prisma.device.findFirst({
    where: { id: parsed.data.deviceId, userId: gate },
    select: { id: true, gardenId: true },
  });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (device.gardenId && device.gardenId !== pot.gardenId) {
    return NextResponse.json({ error: "The device and pot must be in the same garden" }, { status: 400 });
  }
  return { potId: pot.id, deviceId: device.id, gardenId: pot.gardenId, unassigned: !device.gardenId };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const target = await resolve(req, params);
  if (target instanceof NextResponse) return target;
  const occupant = await otherDeviceOnPot(target.potId, target.deviceId);
  if (occupant) {
    return NextResponse.json(
      { error: `This pot already has a sensor (${occupant}). Disconnect it first.` },
      { status: 409 },
    );
  }
  const link = { deviceId: target.deviceId, potId: target.potId };
  await prisma.$transaction(async (tx) => {
    // A device without a garden joins the pot's garden.
    if (target.unassigned) await tx.device.update({ where: { id: target.deviceId }, data: { gardenId: target.gardenId } });
    await tx.devicePotMapping.upsert({ where: { deviceId_potId: link }, update: {}, create: link });
  });
  return NextResponse.json({ connected: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const target = await resolve(req, params);
  if (target instanceof NextResponse) return target;
  await prisma.devicePotMapping.deleteMany({ where: { deviceId: target.deviceId, potId: target.potId } });
  return NextResponse.json({ connected: false });
}
