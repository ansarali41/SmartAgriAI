-- Disconnect keeps the bot saved: alerts pause instead of the token being deleted.
ALTER TABLE "TelegramSettings" ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT false;
