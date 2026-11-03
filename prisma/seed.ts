import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

// Mirror of lib/password.ts (scrypt) — kept inline so seed has no app imports.
function hashPassword(password: string, salt?: string) {
  const passwordSalt = salt || crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync(password, passwordSalt, 64).toString("hex");
  return { passwordHash, passwordSalt };
}
function hashDeviceKey(plain: string) {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

const DEMO_EMAIL = "demo@smartagri.ai";
// Seed credentials are generated for each run unless supplied explicitly for
// local development. They are never production credentials.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? crypto.randomBytes(18).toString("base64url");
const DEMO_DEVICE_KEY = process.env.DEMO_DEVICE_KEY ?? `sk_dev_${crypto.randomBytes(24).toString("hex")}`;
const DEMO_DEVICE_KEY_2 = process.env.DEMO_DEVICE_KEY_2 ?? `sk_dev_${crypto.randomBytes(24).toString("hex")}`;
const DEMO_HARDWARE_ID = "ESP32-GARDEN-01";
const DEMO_HARDWARE_ID_2 = "ESP32-GARDEN-02";

async function main() {
  console.log("Seeding SmartAgri demo data…");

  const { passwordHash, passwordSalt } = hashPassword(DEMO_PASSWORD);

  // Clean prior demo user (cascade clears everything it owns).
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      passwordSalt,
      userName: "Demo Farmer",
      irrigationConfig: {
        create: { thresholdPercent: 30, manualOverride: false, currentStatus: "off" },
      },
    },
  });

  const garden = await prisma.garden.create({
    data: {
      userId: user.id,
      name: "North Field",
      type: "outdoor",
      location: "Dhaka",
    },
  });

  const secondGarden = await prisma.garden.create({
    data: {
      userId: user.id,
      name: "South Greenhouse",
      type: "greenhouse",
      location: "Dhaka",
    },
  });

  const [pot1, pot2, pot3] = await Promise.all([
    prisma.pot.create({
      data: {
        id: "POT-01",
        userId: user.id,
        gardenId: garden.id,
        label: "POT-01",
        soilType: "loam",
      },
    }),
    prisma.pot.create({
      data: {
        id: "POT-02",
        userId: user.id,
        gardenId: garden.id,
        label: "POT-02",
        soilType: "potting_mix",
      },
    }),
    prisma.pot.create({
      data: {
        id: "POT-03",
        userId: user.id,
        gardenId: garden.id,
        label: "POT-03",
        soilType: "sandy",
      },
    }),
  ]);

  await prisma.pot.create({
    data: {
      id: "POT-04",
      userId: user.id,
      gardenId: secondGarden.id,
      label: "POT-04",
      soilType: "loam",
    },
  });

  await prisma.plant.create({
    data: {
      userId: user.id,
      gardenId: garden.id,
      potId: pot1.id,
      commonName: "Tomato",
      variety: "Roma",
      growthStage: "vegetative",
      healthStatus: "healthy",
      plantedAt: new Date("2026-05-01"),
      threshold: {
        create: {
          soilMoistureMin: 35,
          soilMoistureMax: 70,
          tempDayMin: 18,
          tempDayMax: 32,
          humidityMin: 45,
          humidityMax: 80,
        },
      },
    },
  });

  const device = await prisma.device.create({
    data: {
      userId: user.id,
      gardenId: garden.id,
      hardwareId: DEMO_HARDWARE_ID,
      name: "Field node 1",
      type: "esp32_node",
      apiKeyHash: hashDeviceKey(DEMO_DEVICE_KEY),
    },
  });

  await prisma.device.create({
    data: {
      userId: user.id,
      gardenId: secondGarden.id,
      hardwareId: DEMO_HARDWARE_ID_2,
      name: "Greenhouse node 1",
      type: "esp32_node",
      apiKeyHash: hashDeviceKey(DEMO_DEVICE_KEY_2),
    },
  });

  // Seed a few hours of readings so charts and health score have history.
  const now = Date.now();
  const readings = [];
  for (let i = 24; i >= 0; i--) {
    const recordedAt = new Date(now - i * 10 * 60 * 1000); // every 10 min
    const moisture = 45 + Math.round(Math.sin(i / 3) * 12);
    const temperature = 27 + Math.round(Math.cos(i / 4) * 3);
    const humidity = 65 + Math.round(Math.sin(i / 5) * 8);
    for (const [metric, value, unit] of [
      ["soil_moisture", moisture, "%"],
      ["temperature", temperature, "C"],
      ["humidity", humidity, "%"],
    ] as const) {
      readings.push({
        userId: user.id,
        gardenId: garden.id,
        potId: metric === "soil_moisture" ? pot1.id : null,
        deviceId: device.id,
        hardwareId: device.hardwareId,
        metric,
        value,
        unit,
        recordedAt,
      });
    }
  }
  await prisma.reading.createMany({ data: readings });

  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "info",
      severity: "low",
      title: "Welcome to SmartAgri",
      message: "Your demo farm is ready. Connect an ESP32 or run the simulator to see live data.",
    },
  });

  console.log("\nSeed complete ✓");
  console.log("  Login:        ", DEMO_EMAIL, "/", DEMO_PASSWORD);
  console.log("  Device key:   ", DEMO_DEVICE_KEY);
  console.log("  Hardware ID:  ", DEMO_HARDWARE_ID);
  console.log("  Device key 2: ", DEMO_DEVICE_KEY_2);
  console.log("  Hardware ID 2:", DEMO_HARDWARE_ID_2);
  console.log("  Pots:         ", [pot1.id, pot2.id, pot3.id].join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
