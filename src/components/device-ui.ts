// Shared display helpers for devices: status colours/labels, friendly type
// names and relative times. Used by the Sensors page and garden details.

export interface DeviceStatusStyle {
  dot: string;
  pill: string;
  label: string;
  hint: string;
}

const DEVICE_STATUS: Record<string, DeviceStatusStyle> = {
  ONLINE: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    label: "Online",
    hint: "Sending readings normally",
  },
  STALE: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    label: "Delayed",
    hint: "Hasn't reported for a little while",
  },
  OFFLINE: {
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    label: "Offline",
    hint: "Not reporting — check power and Wi-Fi",
  },
};

const WAITING: DeviceStatusStyle = {
  dot: "bg-slate-400",
  pill: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  label: "Waiting",
  hint: "Hasn't sent its first reading yet",
};

export function deviceStatus(status: string): DeviceStatusStyle {
  return DEVICE_STATUS[status] ?? WAITING;
}

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  esp32_node: "ESP32 sensor node",
  soil_moisture: "Soil moisture sensor",
  dht22: "DHT22 temperature / humidity",
  dht11: "DHT11 temperature / humidity",
  rain: "Rain sensor",
  ldr: "Light sensor",
  water_flow: "Water flow meter",
  solenoid_valve: "Solenoid valve",
  camera: "Camera",
};

export function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
