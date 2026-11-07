import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const { sendTelegramForUser } = await import("@/lib/telegram-settings");
  const result = await sendTelegramForUser(
    gate,
    `✅ SmartAgri is connected. You'll get pump, device and disease alerts here. (${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })})`,
  );

  if (!result.ok) {
    // Explain the likely cause without exposing the token or chat ID.
    const reasons: Record<string, string> = {
      configuration: "Telegram isn't connected yet — connect your bot in Settings first.",
      http:
        result.providerCode === "HTTP_401" || result.providerCode === "HTTP_404"
          ? "Telegram rejected the bot token — copy it again from @BotFather."
          : result.providerCode === "HTTP_400" || result.providerCode === "HTTP_403"
            ? "Telegram couldn't reach that chat — open your bot in Telegram, press Start, and check the chat ID."
            : "Telegram returned an error. Try again in a minute.",
      api: "Telegram returned an error. Check the chat ID and that you've pressed Start in the bot.",
      network: "Couldn't reach Telegram — check the internet connection.",
      timeout: "Telegram took too long to answer. Try again.",
      "invalid-message": "The test message was invalid.",
    };
    return NextResponse.json(
      { error: reasons[result.reason] ?? "Telegram test message could not be delivered.", code: result.providerCode ?? result.reason },
      { status: result.reason === "configuration" ? 400 : 502 },
    );
  }

  return NextResponse.json({ success: true });
}
