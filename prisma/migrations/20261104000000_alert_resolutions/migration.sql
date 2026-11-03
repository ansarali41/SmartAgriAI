-- CreateTable
CREATE TABLE "AlertResolution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gardenId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertResolution_userId_idx" ON "AlertResolution"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertResolution_gardenId_alertKey_key" ON "AlertResolution"("gardenId", "alertKey");

-- AddForeignKey
ALTER TABLE "AlertResolution" ADD CONSTRAINT "AlertResolution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertResolution" ADD CONSTRAINT "AlertResolution_gardenId_fkey" FOREIGN KEY ("gardenId") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;
