-- Per-user Telegram connection configured from the Settings page.
CREATE TABLE "TelegramSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botTokenCipher" TEXT NOT NULL,
    "botUsername" TEXT NOT NULL,
    "chatId" TEXT,
    "chatName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramSettings_userId_key" ON "TelegramSettings"("userId");

ALTER TABLE "TelegramSettings" ADD CONSTRAINT "TelegramSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
