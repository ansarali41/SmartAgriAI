// Connect / disconnect the user's own Telegram bot from Settings.
// PUT { botToken }: checks the token with Telegram, stores it encrypted, and
// tries to find the chat straight away (if the user already pressed Start).
// DELETE: disconnect (keeps the bot, paused) or ?forget=1 (removes it);
// PATCH: reconnect the saved bot. The token is never returned to the browser.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/secret-box";

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
    paused: false,
    botTokenCipher: sealSecret(token),
    botUsername: bot.username,
    chatId: chat.ok ? chat.chatId : null,
    chatName: chat.ok ? chat.chatName : null,
  };
  await prisma.telegramSettings.upsert({ where: { userId: gate }, create: { userId: gate, ...data }, update: data });
  return NextResponse.json({ botUsername: bot.username, chatFound: chat.ok, chatName: data.chatName });
}

/**
 * DELETE: disconnect — alerts stop but the bot stays saved (paused), so it can
 * be reconnected without the token. DELETE ?forget=1 removes the bot for good.
 */
export async function DELETE(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  if (new URL(req.url).searchParams.get("forget") === "1") {
    await prisma.telegramSettings.deleteMany({ where: { userId: gate } });
    return NextResponse.json({ success: true, forgotten: true });
  }
  await prisma.telegramSettings.updateMany({ where: { userId: gate }, data: { paused: true } });
  return NextResponse.json({ success: true, paused: true });
}

/** PATCH: reconnect the saved bot — checks the token with Telegram again, then resumes alerts. */
export async function PATCH() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const settings = await prisma.telegramSettings.findUnique({ where: { userId: gate } });
  if (!settings) return NextResponse.json({ error: "No saved bot — paste a bot token to connect." }, { status: 404 });
  const token = openSecret(settings.botTokenCipher);
  if (!token) {
    return NextResponse.json({ error: "The saved token can't be read any more (the server secret changed). Paste it again." }, { status: 400 });
  }
  const { findTelegramChat, getTelegramBot } = await import("@/lib/telegram");
  const bot = await getTelegramBot(token);
  if (!bot.ok) {
    return NextResponse.json(
      { error: bot.reason === "network" ? "Couldn't reach Telegram — check the internet connection." : "Telegram no longer accepts the saved token (it may have been revoked). Paste a new one." },
      { status: 400 },
    );
  }
  // Keep the chat it already had; look again only if there wasn't one.
  const chat = settings.chatId ? null : await findTelegramChat(token);
  const updated = await prisma.telegramSettings.update({
    where: { userId: gate },
    data: {
      paused: false,
      botUsername: bot.username,
      ...(chat?.ok ? { chatId: chat.chatId, chatName: chat.chatName } : {}),
    },
  });
  return NextResponse.json({ botUsername: updated.botUsername, chatFound: Boolean(updated.chatId), chatName: updated.chatName });
}
