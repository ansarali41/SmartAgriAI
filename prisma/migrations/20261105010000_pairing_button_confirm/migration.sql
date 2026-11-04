-- AlterTable
ALTER TABLE "DevicePairing" ADD COLUMN     "confirmRequestedAt" TIMESTAMP(3),
ADD COLUMN     "requestGardenId" TEXT,
ADD COLUMN     "requestName" TEXT,
ADD COLUMN     "requestPotId" TEXT,
ADD COLUMN     "requestUserId" TEXT;
