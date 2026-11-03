export interface GardenAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  gardenId: string;
  potId?: string;
  plantId?: string;
}

type AlertInput = {
  gardenId: string;
  pots: { id: string; label: string; plant: { id: string; commonName: string } | null; moisture: number | null; moistureOnThreshold: number }[];
  devices: { id: string; name: string; status: string }[];
  weather: { current: { rain: number; rainProb: number } } | null;
  latestPredictions: { id?: string; potId: string; plantId: string; predictedDisease: string; className: string | null }[];
  failedCommands: { id: string; potId: string; error: string | null }[];
};

export function buildGardenAlerts(input: AlertInput): GardenAlert[] {
  const alerts: GardenAlert[] = [];
  for (const pot of input.pots) {
    if (pot.moisture != null && pot.moisture <= pot.moistureOnThreshold) {
      alerts.push({
        id: `dry-${pot.id}`, severity: "critical", title: "Critically dry soil",
        message: `${pot.label} is at ${pot.moisture}% (pump-on threshold ${pot.moistureOnThreshold}%).`,
        gardenId: input.gardenId, potId: pot.id, plantId: pot.plant?.id,
      });
    }
  }
  for (const device of input.devices) {
    if (device.status === "OFFLINE") {
      alerts.push({ id: `offline-${device.id}`, severity: "warning", title: "Device offline", message: `${device.name} has not checked in recently.`, gardenId: input.gardenId });
    }
  }
  if (input.weather && (input.weather.current.rain > 0 || input.weather.current.rainProb >= 70)) {
    alerts.push({ id: "rain", severity: "info", title: "Rain expected", message: `Current precipitation ${input.weather.current.rain} mm; rain probability ${input.weather.current.rainProb}%.`, gardenId: input.gardenId });
  }
  for (const prediction of input.latestPredictions) {
    const healthy = (prediction.className ?? prediction.predictedDisease).toLowerCase().includes("healthy");
    // Keyed by prediction so resolving one diagnosis doesn't hide a later one.
    const id = prediction.id ? `disease-${prediction.potId}-${prediction.id}` : `disease-${prediction.potId}`;
    if (!healthy) alerts.push({ id, severity: "warning", title: "Disease detected", message: prediction.predictedDisease, gardenId: input.gardenId, potId: prediction.potId, plantId: prediction.plantId });
  }
  for (const command of input.failedCommands) {
    alerts.push({ id: `pump-failed-${command.id}`, severity: "critical", title: "Pump command failed", message: command.error ?? "The device reported a failed pump command.", gardenId: input.gardenId, potId: command.potId });
  }
  return alerts;
}

/**
 * Hide alerts the user marked resolved. Resolutions whose alert is no longer
 * active are returned as `stale` so the caller can delete them — that way the
 * same alert shows again if its condition comes back later.
 */
export function applyAlertResolutions(
  alerts: GardenAlert[],
  resolutions: Iterable<string | { alertKey: string; resolvedAt: Date }>,
) {
  const resolvedAt = new Map<string, Date | null>();
  for (const entry of resolutions) {
    if (typeof entry === "string") resolvedAt.set(entry, null);
    else resolvedAt.set(entry.alertKey, entry.resolvedAt);
  }
  const activeIds = new Set(alerts.map((alert) => alert.id));
  const resolved = alerts
    .filter((alert) => resolvedAt.has(alert.id))
    .map((alert) => ({ ...alert, resolvedAt: resolvedAt.get(alert.id) ?? null }));
  return {
    alerts: alerts.filter((alert) => !resolvedAt.has(alert.id)),
    resolved,
    resolvedCount: resolved.length,
    stale: [...resolvedAt.keys()].filter((key) => !activeIds.has(key)),
  };
}
