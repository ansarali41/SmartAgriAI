// PHASE 7: Manual pot pump commands. UI talks only to this backend endpoint.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import {
  commandToPumpState,
  findPotDevice,
  pumpStateToCommand,
  queuePumpCommand,
} from "@/lib/device-commands";
import { prisma } from "@/lib/db";
import { getDeviceConnectionStatus } from "@/lib/device-status";

const schema = z
  .object({
    pumpState: z.enum(["on", "off"]).optional(),
    command: z.enum(["PUMP_ON", "PUMP_OFF"]).optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.pumpState || value.command) &&
      (!value.pumpState || !value.command || pumpStateToCommand(value.pumpState) === value.command),
    { message: "Provide one pump command, or matching command and pumpState values" },
  );

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success || (!parsed.data.pumpState && !parsed.data.command)) {
    return NextResponse.json({ error: "Invalid pump command" }, { status: 400 });
  }

  const { id } = await params;
  const pot = await prisma.pot.findFirst({
    where: { id, userId: gate },
    select: {
      id: true,
      userId: true,
      gardenId: true,
      irrigationMode: true,
      pumpState: true,
      garden: { select: { id: true, userId: true } },
    },
  });

  if (!pot || pot.garden.userId !== gate) {
    return NextResponse.json({ error: "Pot not found" }, { status: 404 });
  }

  if (pot.irrigationMode !== "MANUAL") {
    return NextResponse.json(
      { error: "Pump commands require MANUAL irrigation mode" },
      { status: 400 },
    );
  }

  const device = await findPotDevice(pot.id, pot.gardenId, gate);
  if (!device) {
    return NextResponse.json(
      { error: "No ESP32 device associated with this pot's garden" },
      { status: 409 },
    );
  }

  const command =
    parsed.data.command ?? pumpStateToCommand(parsed.data.pumpState ?? "off");

  const isOnline = getDeviceConnectionStatus(device.lastSeenAt) === "ONLINE";
  if (!isOnline && command === "PUMP_ON") {
    return NextResponse.json(
      { error: "The garden ESP32 is offline; the pump command was not queued." },
      { status: 409 },
    );
  }

  const outstanding = await prisma.deviceCommand.findFirst({
    where: { deviceId: device.id, potId: pot.id, status: { in: ["PENDING", "SENT"] } },
    orderBy: { createdAt: "desc" },
    select: { command: true },
  });
  // An offline MANUAL OFF is deliberately queued even if the last server-side
  // confirmation was already OFF: the physical relay may have changed while
  // communication was lost, and OFF is the safety command.
  if ((command === "PUMP_ON" || isOnline) && commandToPumpState(command) === pot.pumpState &&
    (!outstanding || outstanding.command === command)) {
    return NextResponse.json({
      accepted: false,
      message: `Pump is already confirmed ${pot.pumpState}.`,
      pumpState: pot.pumpState,
    });
  }

  const queued = await queuePumpCommand({
    userId: gate,
    gardenId: pot.gardenId,
    deviceId: device.id,
    potId: pot.id,
    command,
    mode: "MANUAL",
  });

  return NextResponse.json({
    accepted: !queued.blocked,
    command: queued.command,
    queued: queued.created,
      message: !isOnline && command === "PUMP_OFF"
      ? "Pump OFF command queued for safe delivery when the device reconnects; the displayed state remains the last confirmed state."
      : queued.blocked
      ? "The previous pump command is awaiting device acknowledgement; no conflicting command was queued."
      : queued.created
      ? "Pump command queued; pump state changes only after device acknowledgement."
      : "An identical pump command is already awaiting device acknowledgement.",
  }, { status: queued.blocked ? 409 : 200 });
}
