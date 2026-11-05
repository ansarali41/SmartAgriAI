import "server-only";

import { prisma } from "@/lib/db";
import { formatDeviceOfflineNotification, formatDeviceRecoveredNotification } from "@/lib/business-notifications";
import { enqueueTelegramDelivery } from "@/lib/telegram-delivery-enqueue";
import { getDeviceConnectionThresholds } from "@/lib/device-status";
import { createAppNotification } from "@/lib/notify";

// This is also the server-side observation of the relay fail-safe window.
export { DEFAULT_DEVICE_OFFLINE_THRESHOLD_SECONDS } from "@/lib/device-status";
export const DEFAULT_OFFLINE_MONITOR_BATCH_SIZE = 25;

type MonitoringStore = Pick<typeof prisma, "device" | "$transaction">;

export function getDeviceOfflineThresholdMs(env: Record<string, string | undefined> = process.env) {
  return getDeviceConnectionThresholds(env).offlineMs;
}

export function deviceOfflineEventKey(deviceId: string, lastSeenAt: Date) {
  return `device:${deviceId}:offline:${lastSeenAt.toISOString()}`;
}

export function deviceRecoveryEventKey(deviceId: string, lastSeenAt: Date) {
  return `device:${deviceId}:recovered:${lastSeenAt.toISOString()}`;
}

export async function runDeviceOfflineMonitor(options: {
  now?: Date;
  limit?: number;
  env?: Record<string, string | undefined>;
  store?: MonitoringStore;
} = {}) {
  const store = options.store ?? prisma;
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_OFFLINE_MONITOR_BATCH_SIZE, 50));
  const thresholdMs = getDeviceOfflineThresholdMs(options.env);
  const offlineBefore = new Date(now.getTime() - thresholdMs);
  const candidates = await store.device.findMany({
    where: { status: "ONLINE", lastSeenAt: { lt: offlineBefore } },
    select: { id: true, userId: true, name: true, lastSeenAt: true, garden: { select: { name: true } } },
    orderBy: { lastSeenAt: "asc" },
    take: limit,
  });

  let transitioned = 0;
  for (const device of candidates) {
    if (!device.lastSeenAt) continue;
    const lastSeenAt = device.lastSeenAt;
    const result = await store.$transaction(async (tx) => {
      // This conditional state change is the transition lock: concurrent
      // scheduler calls can enqueue at most one offline record for an episode.
      const update = await tx.device.updateMany({
        where: { id: device.id, status: "ONLINE", lastSeenAt: { lt: offlineBefore } },
        data: { status: "OFFLINE" },
      });
      if (update.count !== 1) return false;
      await enqueueTelegramDelivery(tx, {
        userId: device.userId,
        eventKey: deviceOfflineEventKey(device.id, lastSeenAt),
        eventType: "DEVICE_OFFLINE",
        eventRef: device.id,
        messageText: formatDeviceOfflineNotification({
          deviceName: device.name,
          gardenName: device.garden?.name ?? "No garden",
          lastSeenAt,
          thresholdSeconds: thresholdMs / 1_000,
        }),
      });
      await createAppNotification(tx, {
        userId: device.userId,
        type: "warning",
        severity: "medium",
        title: `${device.name} went offline`,
        message: `No data from ${device.name}${device.garden ? ` in ${device.garden.name}` : ""} since ${lastSeenAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Check its power and Wi-Fi. Automatic watering for its pot is paused.`,
        actionUrl: "/sensors",
      });
      return true;
    });
    if (result) transitioned += 1;
  }
  return { checked: candidates.length, transitioned, thresholdSeconds: thresholdMs / 1_000 };
}
