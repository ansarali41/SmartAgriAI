// Analytics for one pot, shaped for charts: soil moisture averaged into
// ~180 time buckets (so 30 days of 5-second readings stays small), summary
// numbers, waterings per hour/day, garden weather and a readable activity log.
// The Excel export still uses the raw rows from getPotAnalytics.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Timestamps are stored as UTC in "timestamp without time zone" columns, but a
// JS Date in $queryRaw is sent as timestamptz — Postgres would then read the
// column in the session zone (Asia/Dhaka) and shift every comparison by 6 h.
// Convert parameters to plain UTC timestamps instead.
const utc = (date: Date) => Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`;

const TARGET_POINTS = 180;

type Bucket = { t: Date; avg: number; min: number; max: number; n: number };

export async function getPotAnalyticsOverview(userId: string, gardenId: string, potId: string, start: Date, endParam?: Date) {
  const pot = await prisma.pot.findFirst({
    where: { id: potId, gardenId, userId },
    select: {
      id: true,
      number: true,
      label: true,
      irrigationMode: true,
      pumpState: true,
      moistureOnThreshold: true,
      moistureOffThreshold: true,
      garden: { select: { id: true, name: true } },
      plant: { select: { commonName: true } },
    },
  });
  if (!pot) return null;

  const now = new Date();
  const end = endParam && endParam < now ? endParam : now;
  const spanSeconds = Math.max(60, (end.getTime() - start.getTime()) / 1000);
  // Whole minutes, so buckets line up with clock time.
  const bucketSeconds = Math.max(60, Math.ceil(spanSeconds / TARGET_POINTS / 60) * 60);
  const on = pot.moistureOnThreshold;
  const off = pot.moistureOffThreshold;

  const [buckets, statsRows, last, pumpEvents, weather, events] = await Promise.all([
    prisma.$queryRaw<Bucket[]>`
      SELECT date_bin(make_interval(secs => ${bucketSeconds}), "recordedAt", ${utc(start)}) AS t,
             avg("value")::float AS avg, min("value")::float AS min, max("value")::float AS max, count(*)::int AS n
      FROM "Reading"
      WHERE "userId" = ${userId} AND "potId" = ${potId} AND "metric" = 'soil_moisture'
        AND "recordedAt" >= ${utc(start)} AND "recordedAt" < ${utc(end)}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ n: number; avg: number | null; min: number | null; max: number | null; in_band: number }[]>`
      SELECT count(*)::int AS n, avg("value")::float AS avg, min("value")::float AS min, max("value")::float AS max,
             count(*) FILTER (WHERE "value" >= ${on} AND "value" <= ${off})::int AS in_band
      FROM "Reading"
      WHERE "userId" = ${userId} AND "potId" = ${potId} AND "metric" = 'soil_moisture'
        AND "recordedAt" >= ${utc(start)} AND "recordedAt" < ${utc(end)}`,
    prisma.reading.findFirst({
      where: { userId, potId, metric: "soil_moisture", recordedAt: { lt: end } },
      orderBy: { recordedAt: "desc" },
      select: { value: true, recordedAt: true },
    }),
    prisma.irrigationEvent.findMany({
      where: { userId, potId, decision: { in: ["PUMP_ON", "PUMP_OFF"] }, startedAt: { gte: start, lt: end } },
      orderBy: { startedAt: "asc" },
      select: { decision: true, startedAt: true },
    }),
    prisma.weatherSnapshot.findMany({
      where: { gardenId, observedAt: { gte: start, lt: end } },
      orderBy: { observedAt: "asc" },
      select: { observedAt: true, temperature: true, humidity: true, rainProbability: true },
      take: 2000,
    }),
    prisma.irrigationEvent.findMany({
      where: { userId, potId, startedAt: { gte: start, lt: end } },
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true, mode: true, status: true, decision: true, reason: true, soilMoisture: true, onThreshold: true, offThreshold: true },
      take: 200,
    }),
  ]);

  // Full bucket series with nulls where nothing was recorded, so the chart
  // shows gaps (sensor off) instead of drawing a line across them.
  const byTime = new Map(buckets.map((bucket) => [new Date(bucket.t).getTime(), bucket]));
  const moisture: { t: string; avg: number | null; min: number | null; max: number | null }[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += bucketSeconds * 1000) {
    const bucket = byTime.get(t);
    moisture.push({
      t: new Date(t).toISOString(),
      avg: bucket ? round(bucket.avg) : null,
      min: bucket ? round(bucket.min) : null,
      max: bucket ? round(bucket.max) : null,
    });
  }

  // Waterings: count pump starts and pair them with stops for run time.
  const daily = spanSeconds > 2 * 86_400;
  const wateringBuckets = new Map<string, { count: number; seconds: number }>();
  const bucketKey = (date: Date) => {
    const d = new Date(date);
    if (daily) d.setHours(0, 0, 0, 0);
    else d.setMinutes(0, 0, 0);
    return d.toISOString();
  };
  let waterings = 0;
  let pumpSeconds = 0;
  let onAt: Date | null = null;
  for (const event of pumpEvents) {
    if (event.decision === "PUMP_ON") {
      waterings += 1;
      const key = bucketKey(event.startedAt);
      const entry = wateringBuckets.get(key) ?? { count: 0, seconds: 0 };
      entry.count += 1;
      wateringBuckets.set(key, entry);
      onAt ??= event.startedAt;
    } else if (onAt) {
      const seconds = (event.startedAt.getTime() - onAt.getTime()) / 1000;
      pumpSeconds += seconds;
      const entry = wateringBuckets.get(bucketKey(onAt));
      if (entry) entry.seconds += seconds;
      onAt = null;
    }
  }
  const wateringSeries: { t: string; count: number; seconds: number }[] = [];
  const cursor = new Date(start);
  if (daily) cursor.setHours(0, 0, 0, 0);
  else cursor.setMinutes(0, 0, 0);
  while (cursor < end) {
    const key = cursor.toISOString();
    const entry = wateringBuckets.get(key);
    wateringSeries.push({ t: key, count: entry?.count ?? 0, seconds: Math.round(entry?.seconds ?? 0) });
    if (daily) cursor.setDate(cursor.getDate() + 1);
    else cursor.setHours(cursor.getHours() + 1);
  }

  const stats = statsRows[0];
  return {
    pot,
    range: { start: start.toISOString(), end: end.toISOString(), bucketSeconds, daily },
    summary: {
      readings: stats?.n ?? 0,
      avg: stats?.avg != null ? round(stats.avg) : null,
      min: stats?.min != null ? round(stats.min) : null,
      max: stats?.max != null ? round(stats.max) : null,
      inBandPct: stats?.n ? Math.round((stats.in_band / stats.n) * 100) : null,
      lastValue: last ? round(last.value) : null,
      lastReadingAt: last?.recordedAt ?? null,
      waterings,
      pumpSeconds: Math.round(pumpSeconds),
    },
    moisture,
    waterings: wateringSeries,
    weather: weather.map((w) => ({ t: w.observedAt, temperature: w.temperature, humidity: w.humidity, rainProbability: w.rainProbability })),
    events: events.map((event) => ({ id: event.id, t: event.startedAt, mode: event.mode, ...describeEvent(event) })),
  };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function describeEvent(event: {
  status: string;
  decision: string | null;
  reason: string | null;
  mode: string;
  soilMoisture: number | null;
  onThreshold: number | null;
  offThreshold: number | null;
}): { kind: "on" | "off" | "mode" | "other"; title: string; detail: string } {
  const auto = event.mode !== "manual";
  if (event.reason?.startsWith("Irrigation mode set to")) {
    const manual = event.reason.endsWith("MANUAL");
    return { kind: "mode", title: manual ? "Switched to manual" : "Switched to automatic", detail: manual ? "Pump controlled by hand" : "Pump follows the watering levels" };
  }
  if (event.decision === "PUMP_ON") {
    return {
      kind: "on",
      title: "Watering started",
      detail: !auto ? "Turned on by you" : event.soilMoisture != null ? `Soil ${event.soilMoisture}%, below ${event.onThreshold ?? "start"}%` : "Soil below the start level",
    };
  }
  if (event.decision === "PUMP_OFF") {
    return {
      kind: "off",
      title: "Watering stopped",
      detail: !auto ? "Turned off by you" : event.soilMoisture != null ? `Soil reached ${event.soilMoisture}%` : "Soil reached the stop level",
    };
  }
  return { kind: "other", title: `Pump ${event.status}`, detail: event.reason ?? "" };
}

export type PotAnalyticsOverview = NonNullable<Awaited<ReturnType<typeof getPotAnalyticsOverview>>>;
