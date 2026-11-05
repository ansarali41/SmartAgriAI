// Alerts for every garden a user has, in a handful of batched queries (no
// per-garden round trips), for the Gardens list cards. Uses the same rules as
// a garden's details page (buildGardenAlerts) and hides alerts the user has
// marked resolved. Weather isn't fetched here, so the info-only "rain
// expected" alert appears on the details page only.
import { prisma } from "@/lib/db";
import { getDeviceConnectionStatus } from "@/lib/device-status";
import { applyAlertResolutions, buildGardenAlerts, type GardenAlert } from "@/lib/garden-alerts";

export async function getAlertsByGarden(userId: string): Promise<Map<string, GardenAlert[]>> {
  const [pots, latestMoisture, devices, predictions, failedCommands, resolutions] = await Promise.all([
    prisma.pot.findMany({
      where: { userId },
      select: { id: true, label: true, gardenId: true, moistureOnThreshold: true, plant: { select: { id: true, commonName: true } } },
    }),
    // Latest soil reading per pot.
    prisma.$queryRaw<{ potId: string; value: number }[]>`
      SELECT DISTINCT ON ("potId") "potId", "value"::float AS value
      FROM "Reading"
      WHERE "userId" = ${userId} AND "metric" = 'soil_moisture' AND "potId" IS NOT NULL
      ORDER BY "potId", "recordedAt" DESC`,
    prisma.device.findMany({ where: { userId, gardenId: { not: null } }, select: { id: true, name: true, gardenId: true, lastSeenAt: true } }),
    prisma.diseasePrediction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, gardenId: true, potId: true, plantId: true, predictedDisease: true, className: true },
    }),
    prisma.deviceCommand.findMany({
      where: { userId, status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, gardenId: true, potId: true, error: true },
    }),
    prisma.alertResolution.findMany({ where: { userId }, select: { gardenId: true, alertKey: true, resolvedAt: true } }),
  ]);

  const moistureByPot = new Map(latestMoisture.map((row) => [row.potId, Math.round(row.value * 10) / 10]));
  const now = new Date();
  const group = <T,>(items: T[], key: (item: T) => string | null) => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const k = key(item);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), item]);
    }
    return map;
  };
  const potsByGarden = group(pots, (pot) => pot.gardenId);
  const devicesByGarden = group(devices, (device) => device.gardenId);
  const failedByGarden = group(failedCommands, (command) => command.gardenId);
  const resolutionsByGarden = group(resolutions, (resolution) => resolution.gardenId);
  // Newest prediction per pot only (an older diagnosis is superseded).
  const seenPots = new Set<string>();
  const latestPredictions = predictions.filter((prediction) => !seenPots.has(prediction.potId) && seenPots.add(prediction.potId));
  const predictionsByGarden = group(latestPredictions, (prediction) => prediction.gardenId);

  const gardenIds = new Set([...potsByGarden.keys(), ...devicesByGarden.keys(), ...failedByGarden.keys(), ...predictionsByGarden.keys()]);
  const result = new Map<string, GardenAlert[]>();
  for (const gardenId of gardenIds) {
    const alerts = buildGardenAlerts({
      gardenId,
      pots: (potsByGarden.get(gardenId) ?? []).map((pot) => ({
        id: pot.id,
        label: pot.label,
        plant: pot.plant,
        moisture: moistureByPot.get(pot.id) ?? null,
        moistureOnThreshold: pot.moistureOnThreshold,
      })),
      devices: (devicesByGarden.get(gardenId) ?? []).map((device) => ({ id: device.id, name: device.name, status: getDeviceConnectionStatus(device.lastSeenAt, now) })),
      weather: null,
      latestPredictions: predictionsByGarden.get(gardenId) ?? [],
      failedCommands: failedByGarden.get(gardenId) ?? [],
    });
    const { alerts: open } = applyAlertResolutions(alerts, resolutionsByGarden.get(gardenId) ?? []);
    if (open.length) result.set(gardenId, open);
  }
  return result;
}
