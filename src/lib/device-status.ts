export type DeviceConnectionStatus = "NEVER_SEEN" | "ONLINE" | "STALE" | "OFFLINE";

// The board reports every 20 s: two missed reports = delayed, four = offline.
export const DEFAULT_DEVICE_STALE_THRESHOLD_SECONDS = 45;
export const DEFAULT_DEVICE_OFFLINE_THRESHOLD_SECONDS = 90;

type Environment = Record<string, string | undefined>;

function configuredSeconds(value: string | undefined) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : undefined;
}

/**
 * Connection state is derived from the time this server last accepted valid
 * telemetry, never from a device-provided status flag or command traffic.
 */
export function getDeviceConnectionThresholds(env: Environment = process.env) {
  const offlineSeconds = configuredSeconds(env.DEVICE_OFFLINE_THRESHOLD_SECONDS)
    ?? DEFAULT_DEVICE_OFFLINE_THRESHOLD_SECONDS;
  const requestedStaleSeconds = configuredSeconds(env.DEVICE_STALE_THRESHOLD_SECONDS)
    ?? DEFAULT_DEVICE_STALE_THRESHOLD_SECONDS;

  // A legacy installation may only set DEVICE_OFFLINE_THRESHOLD_SECONDS=60.
  // Keep that cutoff authoritative while keeping thresholds ordered.
  const staleSeconds = Math.min(requestedStaleSeconds, Math.max(0, offlineSeconds - 1));
  return { staleMs: staleSeconds * 1_000, offlineMs: offlineSeconds * 1_000 };
}

export function getDeviceConnectionStatus(
  lastSeenAt: Date | null | undefined,
  now = new Date(),
  env: Environment = process.env,
): DeviceConnectionStatus {
  if (!(lastSeenAt instanceof Date) || Number.isNaN(lastSeenAt.getTime()) || lastSeenAt > now) {
    return "NEVER_SEEN";
  }

  const ageMs = now.getTime() - lastSeenAt.getTime();
  const { staleMs, offlineMs } = getDeviceConnectionThresholds(env);
  if (ageMs <= staleMs) return "ONLINE";
  if (ageMs <= offlineMs) return "STALE";
  return "OFFLINE";
}
