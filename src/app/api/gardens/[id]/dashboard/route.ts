import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { applyAlertResolutions, buildGardenAlerts } from "@/lib/garden-alerts";
import { getGardenWeather, type WeatherResult } from "@/lib/weather";
import { persistGardenWeatherSnapshot } from "@/lib/weather-history";
import { getDeviceConnectionStatus } from "@/lib/device-status";

const HISTORY_POINTS_PER_POT = 30;
const AUTO_DECISION_REASONS = [
  "SOIL_DRY",
  "RAIN_EXPECTED",
  "SOIL_DRY_BUT_RAIN_EXPECTED",
  "SOIL_MOISTURE_NORMAL",
];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const garden = await prisma.garden.findFirst({
    where: { id, userId: gate },
    include: {
      devices: { select: { id: true, name: true, type: true, hardwareId: true, status: true, lastSeenAt: true, portCount: true, portStatus: true, potMappings: { select: { port: true, pot: { select: { id: true, label: true } } }, orderBy: { port: "asc" } } }, orderBy: { createdAt: "desc" } },
      pots: {
        include: {
          plant: { select: { id: true, commonName: true, healthStatus: true } },
          deviceMappings: { select: { port: true, device: { select: { id: true, name: true, lastSeenAt: true } } }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { label: "asc" },
      },
    },
  });
  if (!garden) return NextResponse.json({ error: "Garden not found" }, { status: 404 });

  const [readings, pumpHistory, decisionHistory, predictions, failedCommands] = await Promise.all([
    prisma.reading.findMany({ where: { userId: gate, gardenId: id, metric: "soil_moisture", potId: { not: null } }, orderBy: { recordedAt: "desc" }, take: 500, select: { potId: true, value: true, recordedAt: true } }),
    prisma.irrigationEvent.findMany({ where: { userId: gate, gardenId: id }, orderBy: { startedAt: "desc" }, take: 30, select: { id: true, potId: true, mode: true, status: true, reason: true, startedAt: true } }),
    prisma.irrigationEvent.findMany({ where: { userId: gate, gardenId: id, mode: "automatic", reason: { in: AUTO_DECISION_REASONS } }, orderBy: { startedAt: "desc" }, take: 100, select: { potId: true, reason: true, startedAt: true } }),
    prisma.diseasePrediction.findMany({ where: { userId: gate, gardenId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, potId: true, plantId: true, predictedDisease: true, className: true, confidence: true, createdAt: true } }),
    prisma.deviceCommand.findMany({ where: { userId: gate, gardenId: id, status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, potId: true, error: true, createdAt: true } }),
  ]);
  const moistureByPot = new Map<string, { value: number; recordedAt: Date }[]>();
  for (const reading of readings) {
    if (!reading.potId) continue;
    const values = moistureByPot.get(reading.potId) ?? [];
    if (values.length < HISTORY_POINTS_PER_POT) values.push({ value: reading.value, recordedAt: reading.recordedAt });
    moistureByPot.set(reading.potId, values);
  }
  for (const values of moistureByPot.values()) values.reverse();
  // Predictions are newest-first, so preserve the first record for each pot.
  const latestPredictionByPot = new Map<string, (typeof predictions)[number]>();
  for (const prediction of predictions) {
    if (!latestPredictionByPot.has(prediction.potId)) latestPredictionByPot.set(prediction.potId, prediction);
  }
  const latestPredictions = [...latestPredictionByPot.values()];
  let weather: WeatherResult | null = null;
  let weatherUnavailable = false;
  if (garden.lat != null && garden.lng != null) {
    try { weather = await getGardenWeather({ id: garden.id, lat: garden.lat, lng: garden.lng }); if (weather) await persistGardenWeatherSnapshot(garden.id, weather); } catch { weatherUnavailable = true; }
  }
  const now = new Date();
  const pots = garden.pots.map((pot) => {
    const moistureHistory = moistureByPot.get(pot.id) ?? [];
    const irrigationDecision = decisionHistory.find((event) => event.potId === pot.id) ?? null;
    const sensors = pot.deviceMappings.map(({ device, port }) => ({ id: device.id, name: device.name, port, status: getDeviceConnectionStatus(device.lastSeenAt, now), lastSeenAt: device.lastSeenAt }));
    return { id: pot.id, label: pot.label, irrigationMode: pot.irrigationMode, pumpState: pot.pumpState, moistureOnThreshold: pot.moistureOnThreshold, moistureOffThreshold: pot.moistureOffThreshold, soilType: pot.soilType, plant: pot.plant, currentMoisture: moistureHistory.at(-1)?.value ?? null, moistureRecordedAt: moistureHistory.at(-1)?.recordedAt ?? null, moistureHistory, irrigationDecision, sensors };
  });
  const devices = garden.devices.map(({ potMappings, ...device }) => ({
    ...device,
    status: getDeviceConnectionStatus(device.lastSeenAt, now),
    // Which pot each port waters.
    ports: potMappings.map((m) => ({ port: m.port, potId: m.pot.id, potLabel: m.pot.label })),
  }));
  const activeAlerts = buildGardenAlerts({ gardenId: garden.id, pots: pots.map((pot) => ({ id: pot.id, label: pot.label, plant: pot.plant, moisture: pot.currentMoisture, moistureOnThreshold: pot.moistureOnThreshold })), devices, weather, latestPredictions, failedCommands });
  const resolutions = await prisma.alertResolution.findMany({ where: { userId: gate, gardenId: id }, select: { alertKey: true, resolvedAt: true } });
  const { alerts, resolved: resolvedAlertList, resolvedCount, stale } = applyAlertResolutions(activeAlerts, resolutions);
  // The condition behind these has cleared; forget the resolution so a recurrence alerts again.
  if (stale.length) await prisma.alertResolution.deleteMany({ where: { gardenId: id, alertKey: { in: stale } } });
  return NextResponse.json({
    garden: { id: garden.id, name: garden.name, location: garden.location, lat: garden.lat, lng: garden.lng, type: garden.type },
    weather, weatherUnavailable, devices, pots, pumpHistory, diseaseHistory: predictions, alerts, resolvedAlerts: resolvedCount, resolvedAlertList,
  });
}
