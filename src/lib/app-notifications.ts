// In-app notifications (the header bell and /notifications page).
//
// Event notifications are written inside the same transaction as the event
// (pump failed, automatic watering, device offline/back online, disease
// result, new device). Condition notifications — a pot that's dry in manual
// mode, a probe that stopped reading — are found by `sweepUserNotifications`,
// which runs when the bell polls, at most one per pot per condition per day.
import { prisma } from "@/lib/db";
import { runDeviceOfflineMonitor } from "@/lib/device-monitoring";
import { createAppNotificationOnce, potActionUrl } from "@/lib/notify";

/** A reading this fresh counts as live (the board reports every ~5 s). */
const LIVE_READING_MS = 60_000;
/** The board is online but the pot has had no valid reading for this long. */
const PROBE_SILENT_MS = 2 * 60_000;
/** Don't re-run the sweep for a user more often than this. */
const SWEEP_INTERVAL_MS = 20_000;
const lastSweep = new Map<string, number>();

function startOfDay(now: Date) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

export async function sweepUserNotifications(userId: string, now = new Date()) {
  const last = lastSweep.get(userId) ?? 0;
  if (now.getTime() - last < SWEEP_INTERVAL_MS) return;
  lastSweep.set(userId, now.getTime());

  // Mark silent boards offline (and notify) without waiting for the cron job.
  await runDeviceOfflineMonitor({ now }).catch((error) => console.error("Offline monitor failed:", error));

  // Send queued Telegram alerts too, so they go out without the cron job
  // (e.g. in local development). Only when this user has Telegram set up.
  const { getUserTelegramConfig } = await import("@/lib/telegram-settings");
  if (await getUserTelegramConfig(userId)) {
    const { runTelegramDeliveryWorker } = await import("@/lib/telegram-outbox");
    await runTelegramDeliveryWorker(undefined, undefined, { userId }).catch((error) =>
      console.error("Telegram worker failed:", error instanceof Error ? error.message : error),
    );
  }

  const pots = await prisma.pot.findMany({
    where: { userId, deviceMappings: { some: {} } },
    select: {
      id: true,
      label: true,
      gardenId: true,
      irrigationMode: true,
      moistureOnThreshold: true,
      readings: {
        where: { metric: "soil_moisture" },
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: { value: true, recordedAt: true },
      },
      garden: { select: { name: true } },
      plant: { select: { id: true, commonName: true } },
      deviceMappings: { select: { device: { select: { name: true, lastSeenAt: true } } }, take: 1 },
    },
  });

  const today = startOfDay(now);

  // A board that's online but not connected to any pot isn't doing anything useful.
  const idleBoards = await prisma.device.findMany({
    where: { userId, potMappings: { none: {} }, lastSeenAt: { gte: new Date(now.getTime() - LIVE_READING_MS) } },
    select: { id: true, name: true, gardenId: true, garden: { select: { name: true } } },
  });
  for (const board of idleBoards) {
    await createAppNotificationOnce(
      prisma,
      {
        userId,
        gardenId: board.gardenId,
        type: "info",
        severity: "low",
        title: `${board.name} isn't connected to a pot`,
        message: `It's online${board.garden ? ` in ${board.garden.name}` : ""} but not watching any pot, so its readings aren't used. Connect it from a pot's card.`,
        actionUrl: "/pots",
      },
      today,
    );
  }
  for (const pot of pots) {
    const device = pot.deviceMappings[0]?.device;
    const boardOnline = Boolean(device?.lastSeenAt && now.getTime() - device.lastSeenAt.getTime() < LIVE_READING_MS);
    const reading = pot.readings[0];
    const readingAge = reading ? now.getTime() - reading.recordedAt.getTime() : Infinity;
    const base = { userId, gardenId: pot.gardenId, potId: pot.id, plantId: pot.plant?.id ?? null, actionUrl: potActionUrl(pot.gardenId, pot.id) };

    if (boardOnline && readingAge > PROBE_SILENT_MS) {
      await createAppNotificationOnce(
        prisma,
        {
          ...base,
          type: "warning",
          severity: "medium",
          title: `${pot.label}: soil probe not reading`,
          message: `${device!.name} is online but isn't getting valid soil readings in ${pot.garden.name}. Check the probe wiring. Automatic watering is paused.`,
        },
        today,
      );
    } else if (
      pot.irrigationMode === "MANUAL" &&
      readingAge <= LIVE_READING_MS &&
      reading &&
      reading.value < pot.moistureOnThreshold
    ) {
      await createAppNotificationOnce(
        prisma,
        {
          ...base,
          type: "alert",
          severity: "high",
          title: `${pot.label} needs water`,
          message: `${pot.plant?.commonName ?? "The plant"} in ${pot.garden.name} is at ${Math.round(reading.value)}% (below ${pot.moistureOnThreshold}%). It's in manual mode, so turn the pump on or switch to automatic.`,
        },
        today,
      );
    }
  }
}
