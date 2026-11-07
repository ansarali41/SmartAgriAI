// Is Telegram set up, and what's in this user's delivery queue? Never returns
// the bot token, chat ID or message text.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { EXPIRED_ERROR_CODE } from "@/lib/telegram-outbox";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { getTelegramConfig } = await import("@/lib/telegram");
  const settings = await prisma.telegramSettings.findUnique({ where: { userId: gate }, select: { botUsername: true, chatName: true, chatId: true, paused: true } });
  const paused = Boolean(settings?.paused);

  const [groups, expired, lastSent, lastFailure] = await Promise.all([
    prisma.telegramDelivery.groupBy({ by: ["status"], where: { userId: gate }, _count: true }),
    prisma.telegramDelivery.count({ where: { userId: gate, status: "FAILED", lastErrorCode: EXPIRED_ERROR_CODE } }),
    prisma.telegramDelivery.findFirst({ where: { userId: gate, status: "SENT" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    prisma.telegramDelivery.findFirst({
      where: { userId: gate, status: { in: ["FAILED", "PENDING"] }, lastErrorCode: { not: null }, NOT: { lastErrorCode: EXPIRED_ERROR_CODE } },
      orderBy: { updatedAt: "desc" },
      select: { lastErrorCode: true, updatedAt: true },
    }),
  ]);
  const count = (status: string) => groups.find((group) => group.status === status)?._count ?? 0;

  return NextResponse.json({
    // Connected = this user's own bot with a chat, or the global .env bot.
    // Disconnected (paused) = nothing is sent, even if a .env bot exists.
    configured: !paused && (Boolean(settings?.chatId) || getTelegramConfig() !== null),
    source: paused ? null : settings?.chatId ? "app" : getTelegramConfig() ? "env" : null,
    bot: settings ? { username: settings.botUsername, chatName: settings.chatName, chatConnected: Boolean(settings.chatId), paused } : null,
    queue: {
      pending: count("PENDING") + count("PROCESSING"),
      sent: count("SENT"),
      failed: count("FAILED") - expired,
      expired,
    },
    lastSentAt: lastSent?.sentAt ?? null,
    lastError: lastFailure ? { code: lastFailure.lastErrorCode, at: lastFailure.updatedAt } : null,
  });
}
