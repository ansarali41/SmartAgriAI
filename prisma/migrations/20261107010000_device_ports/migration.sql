-- One board can serve several pots: a soil probe + pump per port (1–6).
ALTER TABLE "Device" ADD COLUMN "portCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "DevicePotMapping" ADD COLUMN "port" INTEGER NOT NULL DEFAULT 1;
-- Existing links: number them per board in creation order so none collide.
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "deviceId" ORDER BY "createdAt", "id") AS n
  FROM "DevicePotMapping"
)
UPDATE "DevicePotMapping" m SET "port" = numbered.n FROM numbered WHERE m."id" = numbered."id";
UPDATE "Device" d SET "portCount" = GREATEST(1, (SELECT MAX("port") FROM "DevicePotMapping" m WHERE m."deviceId" = d."id"))
WHERE EXISTS (SELECT 1 FROM "DevicePotMapping" m WHERE m."deviceId" = d."id");

CREATE UNIQUE INDEX "DevicePotMapping_deviceId_port_key" ON "DevicePotMapping"("deviceId", "port");
