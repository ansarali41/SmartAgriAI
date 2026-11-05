// Starter data: one user, two gardens, two pots in each (every pot has a
// plant). No devices — pair a real ESP32 from the Sensors page.
//
// Won't overwrite an existing account: if the user already exists it stops.
// To wipe that user (and everything they own) and start over, run with
// SEED_RESET=true. It never touches any other account.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { findPlantProfile } from "../src/lib/plant-catalog";

const prisma = new PrismaClient();

// Mirror of lib/password.ts (scrypt) — kept inline so seed has no app imports.
function hashPassword(password: string, salt?: string) {
  const passwordSalt = salt || crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync(password, passwordSalt, 64).toString("hex");
  return { passwordHash, passwordSalt };
}

const DEMO_EMAIL = "sanzida@smartagri.ai";
const DEMO_NAME = "Sanzida Zinia";
// Seed credentials are generated for each run unless supplied explicitly for
// local development. They are never production credentials.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? crypto.randomBytes(18).toString("base64url");

const GARDENS = [
  {
    name: "Rooftop Garden",
    type: "outdoor" as const,
    location: "Dhanmondi, Dhaka",
    lat: 23.7465,
    lng: 90.376,
    pots: [
      { plant: "Tomato", variety: "Roma", stage: "fruiting" as const, soilType: "loam" as const, position: "South corner", daysAgo: 60 },
      { plant: "Chili", variety: "Bombai morich", stage: "flowering" as const, soilType: "loam" as const, position: "Near the water tank", daysAgo: 45 },
    ],
  },
  {
    name: "Balcony Garden",
    type: "indoor" as const,
    location: "Uttara Sector 7, Dhaka",
    lat: 23.8697,
    lng: 90.3984,
    pots: [
      { plant: "Money plant", variety: "Golden pothos", stage: "mature" as const, soilType: "potting_mix" as const, position: "Living-room window", daysAgo: 120 },
      { plant: "Tulsi", variety: "", stage: "vegetative" as const, soilType: "loam" as const, position: "Balcony rail", daysAgo: 30 },
    ],
  },
];

async function main() {
  console.log("Seeding SmartAgri demo data…");
  const { passwordHash, passwordSalt } = hashPassword(DEMO_PASSWORD);

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (existing) {
    if (process.env.SEED_RESET !== "true") {
      console.log(`\n${DEMO_EMAIL} already exists — nothing changed.`);
      console.log("To DELETE that account and everything it owns and seed it again, run:  SEED_RESET=true npm run db:seed");
      return;
    }
    // Cascade clears everything this user owns. No other account is touched.
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      passwordSalt,
      userName: DEMO_NAME,
      irrigationConfig: { create: { thresholdPercent: 30, manualOverride: false, currentStatus: "off" } },
    },
  });

  const now = Date.now();
  let potNumber = 0;

  for (const spec of GARDENS) {
    const garden = await prisma.garden.create({
      data: { userId: user.id, name: spec.name, type: spec.type, location: spec.location, lat: spec.lat, lng: spec.lng },
    });

    for (const potSpec of spec.pots) {
      const profile = findPlantProfile(potSpec.plant);
      if (!profile) throw new Error(`"${potSpec.plant}" is not in the plant catalog`);
      potNumber += 1;
      const pot = await prisma.pot.create({
        data: {
          userId: user.id,
          gardenId: garden.id,
          number: potNumber,
          label: `POT-${potNumber}`,
          soilType: potSpec.soilType,
          position: potSpec.position,
          irrigationMode: "AUTO",
          moistureOnThreshold: profile.moisture[0],
          moistureOffThreshold: profile.moisture[1],
        },
      });
      await prisma.plant.create({
        data: {
          userId: user.id,
          gardenId: garden.id,
          potId: pot.id,
          commonName: profile.name,
          scientificName: profile.scientificName,
          variety: potSpec.variety || undefined,
          growthStage: potSpec.stage,
          healthStatus: "healthy",
          plantedAt: new Date(now - potSpec.daysAgo * 86_400_000),
          threshold: {
            create: {
              soilMoistureMin: profile.moisture[0],
              soilMoistureMax: profile.moisture[1],
              tempDayMin: profile.tempC[0],
              tempDayMax: profile.tempC[1],
              humidityMin: profile.humidity[0],
              humidityMax: profile.humidity[1],
            },
          },
        },
      });
    }

  }

  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "info",
      severity: "low",
      title: "Welcome to SmartAgri",
      message: "Your gardens are ready: two gardens with two pots each. Pair an ESP32 from the Sensors page to see live soil readings.",
    },
  });

  console.log("\nSeed complete ✓");
  console.log("  Login:  ", DEMO_EMAIL, "/", DEMO_PASSWORD);
  console.log("  Gardens: ", GARDENS.map((g) => `${g.name} (${g.pots.map((p) => p.plant).join(", ")})`).join(" · "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
