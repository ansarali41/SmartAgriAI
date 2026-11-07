// TASK: Domain CRUD — Device update (PATCH: rename / place in a garden and
// pot, or take out of one) and delete (DELETE) by id.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { otherDeviceOnPot } from "@/lib/device-claim";
import { MAX_PORTS } from "@/lib/device-pot";

const schema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    // null = not in a garden (yet); the device stays registered.
    gardenId: z.string().trim().min(1).nullable().optional(),
    // Single-pot boards: the pot it serves (null = none). Goes on port 1.
    potId: z.string().trim().min(1).nullable().optional(),
    // How many ports (probe + pump pairs) the board runs, 1–6. Firmware 2.9+
    // picks it up on its next command poll.
    portCount: z.number().int().min(1).max(MAX_PORTS).optional(),
    // Multi-pot boards: what each port serves (potId null = disconnect that port).
    ports: z
      .array(z.object({ port: z.number().int().min(1).max(MAX_PORTS), potId: z.string().trim().min(1).nullable() }))
      .max(MAX_PORTS)
      .optional(),
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
  const device = await prisma.device.findFirst({ where: { id, userId: gate }, select: { id: true, gardenId: true, portCount: true } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const { name, potId, ports, portCount } = parsed.data;

  if (portCount !== undefined) {
    const busy = await prisma.devicePotMapping.findFirst({
      where: { deviceId: id, port: { gt: portCount } },
      orderBy: { port: "desc" },
      select: { port: true, pot: { select: { label: true } } },
    });
    if (busy) {
      return NextResponse.json({ error: `Port ${busy.port} waters ${busy.pot.label} — disconnect it first.` }, { status: 409 });
    }
    await prisma.device.update({ where: { id }, data: { portCount, desiredPorts: portCount } });
    if (name === undefined && parsed.data.gardenId === undefined && potId === undefined && !ports) {
      return NextResponse.json({ success: true, portCount });
    }
  }
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
      return NextResponse.json({ error: `This pot already has a device (${occupant}). Disconnect it first.` }, { status: 409 });
    }
  }

  if (ports) {
    if (ports.some((entry) => entry.potId) && !gardenId) return NextResponse.json({ error: "Choose the pots' garden too" }, { status: 400 });
    const potIds = ports.map((entry) => entry.potId).filter((value): value is string => Boolean(value));
    if (new Set(potIds).size !== potIds.length) return NextResponse.json({ error: "A pot can only be on one port" }, { status: 400 });
    if (new Set(ports.map((entry) => entry.port)).size !== ports.length) return NextResponse.json({ error: "Each port can appear once" }, { status: 400 });
    for (const entry of ports) {
      if (entry.port > device.portCount) {
        return NextResponse.json({ error: `This board has ${device.portCount} port${device.portCount === 1 ? "" : "s"}.` }, { status: 400 });
      }
      if (!entry.potId) continue;
      const pot = await prisma.pot.findFirst({ where: { id: entry.potId, userId: gate, gardenId: gardenId! }, select: { label: true } });
      if (!pot) return NextResponse.json({ error: "Pot not found in this garden" }, { status: 400 });
      const occupant = await otherDeviceOnPot(entry.potId, id);
      if (occupant) return NextResponse.json({ error: `${pot.label} already has a device (${occupant}). Disconnect it first.` }, { status: 409 });
    }
  }

  const gardenChanged = gardenId !== device.gardenId;
  await prisma.$transaction(async (tx) => {
    await tx.device.update({ where: { id }, data: { ...(name ? { name } : {}), gardenId } });
    // Moving gardens (or setting a pot) replaces the pot connection.
    if (gardenChanged || potId !== undefined) await tx.devicePotMapping.deleteMany({ where: { deviceId: id } });
    if (potId) await tx.devicePotMapping.create({ data: { deviceId: id, potId, port: 1 } });
    if (ports) {
      // Clear the ports being set (and wherever those pots were), then link.
      const potIds = ports.map((entry) => entry.potId).filter((value): value is string => Boolean(value));
      await tx.devicePotMapping.deleteMany({ where: { deviceId: id, OR: [{ port: { in: ports.map((entry) => entry.port) } }, { potId: { in: potIds } }] } });
      for (const entry of ports) {
        if (entry.potId) await tx.devicePotMapping.create({ data: { deviceId: id, potId: entry.potId, port: entry.port } });
      }
    }
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
