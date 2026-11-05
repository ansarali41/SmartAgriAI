// TASK: Alerts/Notifications — list user notifications and mark read (one/all).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { sweepUserNotifications } from "@/lib/app-notifications";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  // Pick up conditions (dry pots, silent probes, offline boards) before listing.
  await sweepUserNotifications(gate).catch((error) => console.error("Notification sweep failed:", error));
  const notifications = await prisma.notification.findMany({
    where: { userId: gate },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(notifications);
}

// Mark notification(s) as read.
const schema = z.object({ id: z.string().optional(), all: z.boolean().optional() });

export async function PATCH(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (parsed.data.all) {
    await prisma.notification.updateMany({
      where: { userId, status: "unread" },
      data: { status: "read", readAt: new Date() },
    });
  } else if (parsed.data.id) {
    await prisma.notification.updateMany({
      where: { id: parsed.data.id, userId },
      data: { status: "read", readAt: new Date() },
    });
  }
  return NextResponse.json({ success: true });
}
