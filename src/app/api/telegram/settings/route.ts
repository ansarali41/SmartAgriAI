// Connect / disconnect the user's own Telegram bot from Settings.
// PUT { botToken }: checks the token with Telegram, stores it encrypted, and
// tries to find the chat straight away (if the user already pressed Start).
// DELETE: disconnect. The token is never returned to the browser.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { sealSecret } from "@/lib/secret-box";

export const runtime = "nodejs";

const schema = z.object({ botToken: z.string().trim().min(1) });

export async function PUT(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste the bot token from @BotFather." }, { status: 400 });

  const { findTelegramChat, getTelegramBot, looksLikeBotToken } = await import("@/lib/telegram");
  const token = parsed.data.botToken;
  if (!looksLikeBotToken(token)) {
    return NextResponse.json({ error: "That doesn't look like a bot token — it should look like 123456789:AAH…" }, { status: 400 });
  }
  const bot = await getTelegramBot(token);
  if (!bot.ok) {
    return NextResponse.json(
      { error: bot.reason === "network" ? "Couldn't reach Telegram — check the internet connection." : "Telegram didn't accept that token. Copy it again from @BotFather." },
      { status: 400 },
    );
  }
  const chat = await findTelegramChat(token);
  const data = {
    botTokenCipher: sealSecret(token),
    botUsername: bot.username,
    chatId: chat.ok ? chat.chatId : null,
    chatName: chat.ok ? chat.chatName : null,
  };
  await prisma.telegramSettings.upsert({ where: { userId: gate }, create: { userId: gate, ...data }, update: data });
  return NextResponse.json({ botUsername: bot.username, chatFound: chat.ok, chatName: data.chatName });
}

export async function DELETE() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  await prisma.telegramSettings.deleteMany({ where: { userId: gate } });
  return NextResponse.json({ success: true });
}
