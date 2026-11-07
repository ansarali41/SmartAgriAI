// Which Telegram bot/chat a user's alerts go to: the one connected in
// Settings (token stored encrypted), else the global .env configuration.
import "server-only";
import { prisma } from "@/lib/db";
import { openSecret } from "@/lib/secret-box";
import { getTelegramConfig, sendTelegramText, type TelegramConfig } from "@/lib/telegram";

export async function getUserTelegramConfig(userId: string): Promise<{ config: TelegramConfig; source: "app" | "env" } | null> {
  const settings = await prisma.telegramSettings.findUnique({ where: { userId }, select: { botTokenCipher: true, chatId: true, paused: true } });
  // Disconnected in Settings: no alerts at all (not even via the .env bot).
  if (settings?.paused) return null;
  if (settings?.chatId) {
    const botToken = openSecret(settings.botTokenCipher);
    if (botToken) return { config: { botToken, chatId: settings.chatId }, source: "app" };
  }
  const env = getTelegramConfig();
  return env ? { config: env, source: "env" } : null;
}

/** Sends with this user's bot; "configuration" failure if they have none. */
export async function sendTelegramForUser(userId: string, text: string) {
  const resolved = await getUserTelegramConfig(userId);
  if (!resolved) return { ok: false as const, reason: "configuration" as const };
  return sendTelegramText(text, { config: resolved.config });
}
