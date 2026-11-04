-- CreateTable
CREATE TABLE "DevicePairing" (
    "id" TEXT NOT NULL,
    "hardwareId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "pairingCode" TEXT NOT NULL,
    "firmware" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "deviceId" TEXT,
    "pendingKey" TEXT,
    "keyExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePairing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DevicePairing_hardwareId_key" ON "DevicePairing"("hardwareId");

-- CreateIndex
CREATE INDEX "DevicePairing_claimedAt_lastSeenAt_idx" ON "DevicePairing"("claimedAt", "lastSeenAt");
