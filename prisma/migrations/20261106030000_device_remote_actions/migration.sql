-- Remote actions for a board: restart, reset Wi-Fi, sleep (turn off), factory reset.
CREATE TYPE "DeviceAction" AS ENUM ('RESTART', 'RESET_WIFI', 'SLEEP', 'FACTORY_RESET');

ALTER TABLE "Device" ADD COLUMN "pendingAction" "DeviceAction",
ADD COLUMN "pendingActionAt" TIMESTAMP(3);
