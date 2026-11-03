import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const { sendTelegramText } = await import("@/lib/telegram");
  const result = await sendTelegramText(
    `SmartAgri Telegram test message sent at ${new Date().toISOString()}.`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: "Telegram test message could not be delivered." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
