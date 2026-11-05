import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { getDeviceConnectionStatus } from "@/lib/device-status";
import { getAlertsByGarden } from "@/lib/garden-alerts-server";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const [gardens, alertsByGarden] = await Promise.all([prisma.garden.findMany({
    where: { userId: gate }, orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { pots: true, plants: true, devices: true } },
      devices: { select: { lastSeenAt: true } },
      pots: { select: { pumpState: true } },
    },
  }), getAlertsByGarden(gate)]);
  const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;
  const now = new Date();
  return NextResponse.json(gardens.map(({ devices, pots, ...garden }) => {
    const statuses = devices.map((device) => getDeviceConnectionStatus(device.lastSeenAt, now));
    return {
      ...garden,
      deviceSummary: {
        online: statuses.filter((status) => status === "ONLINE").length,
        stale: statuses.filter((status) => status === "STALE").length,
        offline: statuses.filter((status) => status === "OFFLINE").length,
      },
      pumpsOn: pots.filter((pot) => pot.pumpState === "on").length,
      // Open alerts (same rules as the details page), most serious first.
      alerts: (alertsByGarden.get(garden.id) ?? [])
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        .map(({ id, severity, title, message, potId }) => ({ id, severity, title, message, potId })),
    };
  }));
}
