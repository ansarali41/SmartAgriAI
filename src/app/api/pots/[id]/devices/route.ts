// TASK: Connect (POST) or disconnect (DELETE) a device and a pot. The pot goes
// on one of the board's ports — the one asked for, or the first free one
// (see lib/device-pot). One sensor per pot; one pot per port.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { otherDeviceOnPot } from "@/lib/device-claim";
import { MAX_PORTS, firstFreePort, supportsRemotePorts } from "@/lib/device-pot";

const schema = z.object({ deviceId: z.string().trim().min(1), port: z.number().int().min(1).max(MAX_PORTS).optional() });

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
    select: { id: true, name: true, gardenId: true, portCount: true, firmwareVersion: true },
  });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (device.gardenId && device.gardenId !== pot.gardenId) {
    return NextResponse.json({ error: "The device and pot must be in the same garden" }, { status: 400 });
  }
  return { potId: pot.id, deviceId: device.id, deviceName: device.name, portCount: device.portCount, canGrow: supportsRemotePorts(device.firmwareVersion), port: parsed.data.port, gardenId: pot.gardenId, unassigned: !device.gardenId };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const target = await resolve(req, params);
  if (target instanceof NextResponse) return target;
  const occupant = await otherDeviceOnPot(target.potId, target.deviceId);
  if (occupant) {
    return NextResponse.json(
      { error: `This pot already has a device (${occupant}). Disconnect it first.` },
      { status: 409 },
    );
  }
  const links = await prisma.devicePotMapping.findMany({ where: { deviceId: target.deviceId }, select: { potId: true, port: true } });
  const already = links.find((link) => link.potId === target.potId);
  if (already) return NextResponse.json({ connected: true, port: already.port });

  let port: number | null;
  // A port beyond the board's current count adds it (firmware 2.9+ picks it up on its next poll).
  let growTo: number | null = null;
  if (target.port) {
    if (target.port > target.portCount) {
      if (!target.canGrow) {
        return NextResponse.json({ error: `${target.deviceName} has ${target.portCount} port${target.portCount === 1 ? "" : "s"}. Update it to firmware 2.9 to add ports from the app.` }, { status: 400 });
      }
      growTo = target.port;
    }
    port = links.some((link) => link.port === target.port) ? null : target.port;
    if (!port) return NextResponse.json({ error: `Port ${target.port} on ${target.deviceName} is already in use.` }, { status: 409 });
  } else {
    port = firstFreePort(links.map((link) => link.port), target.portCount);
    if (!port) {
      return NextResponse.json(
        { error: `All ${target.portCount} port${target.portCount === 1 ? " is" : "s are"} in use on ${target.deviceName}. Disconnect a pot first.` },
        { status: 409 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    // A device without a garden joins the pot's garden; a new port grows the board.
    if (target.unassigned || growTo) {
      await tx.device.update({
        where: { id: target.deviceId },
        data: { ...(target.unassigned ? { gardenId: target.gardenId } : {}), ...(growTo ? { portCount: growTo, desiredPorts: growTo } : {}) },
      });
    }
    await tx.devicePotMapping.create({ data: { deviceId: target.deviceId, potId: target.potId, port } });
  });
  return NextResponse.json({ connected: true, port });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const target = await resolve(req, params);
  if (target instanceof NextResponse) return target;
  await prisma.devicePotMapping.deleteMany({ where: { deviceId: target.deviceId, potId: target.potId } });
  return NextResponse.json({ connected: false });
}
