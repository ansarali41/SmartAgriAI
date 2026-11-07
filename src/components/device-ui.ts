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
  esp32_node: "ESP32 device",
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
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  // Under a minute show seconds — "1 min ago" for a 35 s gap made a board that
  // had just gone quiet look stale while it still counted as online.
  if (seconds < 60) return `${Math.floor(seconds / 10) * 10} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
