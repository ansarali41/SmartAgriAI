-- Every pot gets a serial number per user (POT-1, POT-2, …) in creation order.
ALTER TABLE "Pot" ADD COLUMN "number" INTEGER;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt", "id") AS n
  FROM "Pot"
)
UPDATE "Pot" p SET "number" = numbered.n FROM numbered WHERE p."id" = numbered."id";

-- Auto-style labels ("POT-01", "pot 3") follow the serial. Two steps so a swap
-- inside one garden can't trip the (gardenId, label) unique index midway.
UPDATE "Pot" SET "label" = '__renumber__' || "id" WHERE "label" ~* '^pot[- ]?[0-9]+$';
UPDATE "Pot" SET "label" = 'POT-' || "number" WHERE "label" LIKE '\_\_renumber\_\_%';

ALTER TABLE "Pot" ALTER COLUMN "number" SET NOT NULL;
CREATE UNIQUE INDEX "Pot_userId_number_key" ON "Pot"("userId", "number");
