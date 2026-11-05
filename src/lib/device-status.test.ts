import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getDeviceConnectionStatus } from "./device-status";

const now = new Date("2026-10-31T03:30:00.000Z");
const env = {
  DEVICE_STALE_THRESHOLD_SECONDS: "60",
  DEVICE_OFFLINE_THRESHOLD_SECONDS: "120",
};

test("connection state is derived from the latest valid telemetry receipt", () => {
  assert.equal(getDeviceConnectionStatus(new Date(now.getTime() - 30_000), now, env), "ONLINE");
  assert.equal(getDeviceConnectionStatus(new Date(now.getTime() - 90_000), now, env), "STALE");
  assert.equal(getDeviceConnectionStatus(new Date(now.getTime() - 180_000), now, env), "OFFLINE");
  assert.equal(getDeviceConnectionStatus(new Date(now.getTime() - 40 * 60_000), now, env), "OFFLINE");
});

test("new telemetry restores ONLINE and missing or invalid timestamps are never online", () => {
  const offlineReceipt = new Date(now.getTime() - 180_000);
  const freshReceipt = new Date(now.getTime() - 1_000);
  assert.equal(getDeviceConnectionStatus(offlineReceipt, now, env), "OFFLINE");
  assert.equal(getDeviceConnectionStatus(freshReceipt, now, env), "ONLINE");
  assert.equal(getDeviceConnectionStatus(null, now, env), "NEVER_SEEN");
  assert.equal(getDeviceConnectionStatus(new Date("invalid"), now, env), "NEVER_SEEN");
});

test("dashboard polling uses calculated status and command traffic cannot refresh telemetry", () => {
  const dashboard = readFileSync(resolve(process.cwd(), "src/app/(app)/gardens/[id]/page.tsx"), "utf8");
  const commands = readFileSync(resolve(process.cwd(), "src/app/api/iot/commands/route.ts"), "utf8");
  // The garden page re-reads live status every 5 s.
  assert.match(dashboard, /refreshInterval: 5000/);
  assert.match(commands, /claimDeviceCommands/);
  assert.doesNotMatch(commands, /lastSeenAt/);
  assert.doesNotMatch(commands, /status: "ONLINE"/);
});
