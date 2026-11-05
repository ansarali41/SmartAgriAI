// Queue (POST { action }) or cancel (DELETE) a remote action for a board.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { DEVICE_ACTIONS } from "@/lib/device-actions";

const schema = z.object({ action: z.enum(DEVICE_ACTIONS) });

async function ownedDevice(userId: string, id: string) {
  return prisma.device.findFirst({ where: { id, userId }, select: { id: true } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!(await ownedDevice(gate, id))) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  // The board switches its pump relay off itself before carrying out any action.
  await prisma.device.update({ where: { id }, data: { pendingAction: parsed.data.action, pendingActionAt: new Date() } });
  return NextResponse.json({ success: true, action: parsed.data.action });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  if (!(await ownedDevice(gate, id))) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  await prisma.device.update({ where: { id }, data: { pendingAction: null, pendingActionAt: null } });
  return NextResponse.json({ success: true });
}
