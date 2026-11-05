// Send queued Telegram alerts right away (instead of waiting for the
// scheduled worker). Safe to call repeatedly: deliveries are claimed atomically.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { getUserTelegramConfig } = await import("@/lib/telegram-settings");
  if (!(await getUserTelegramConfig(gate))) {
    return NextResponse.json({ error: "Connect Telegram first." }, { status: 400 });
  }
  const { runTelegramDeliveryWorkerUntilIdle } = await import("@/lib/telegram-outbox");
  const result = await runTelegramDeliveryWorkerUntilIdle(undefined, undefined, { userId: gate });
  return NextResponse.json(result);
}
