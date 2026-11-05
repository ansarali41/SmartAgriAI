// Remote actions for a board (restart, reset Wi-Fi, sleep, factory reset).
// The app queues one on the Device row; the board sees it on its next command
// poll (every ~2 s), confirms, then carries it out.
import type { DeviceAction } from "@prisma/client";

export const DEVICE_ACTIONS = ["RESTART", "RESET_WIFI", "SLEEP", "FACTORY_RESET"] as const satisfies readonly DeviceAction[];

/** A queued action the board hasn't picked up within this time is dropped. */
export const ACTION_TTL_MS = 2 * 60 * 1000;

export function isActionLive(action: DeviceAction | null, queuedAt: Date | null, now = new Date()) {
  return Boolean(action && queuedAt && now.getTime() - queuedAt.getTime() < ACTION_TTL_MS);
}
