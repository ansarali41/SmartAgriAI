import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { deviceOfflineEventKey, getDeviceOfflineThresholdMs, runDeviceOfflineMonitor } from "./device-monitoring";

const now = new Date("2026-10-28T06:00:00.000Z");
const lastSeenAt = new Date("2026-10-28T05:40:00.000Z");

test("offline threshold is explicit and defaults to the connection-status fallback", () => {
  assert.equal(getDeviceOfflineThresholdMs({ DEVICE_OFFLINE_THRESHOLD_SECONDS: "120" }), 120_000);
  assert.equal(getDeviceOfflineThresholdMs({ DEVICE_OFFLINE_THRESHOLD_SECONDS: "invalid" }), 90_000);
});

test("concurrent monitors create one offline transition and one durable event", async () => {
  let status = "ONLINE";
  const enqueued: any[] = [];
  const inApp: any[] = [];
  const candidate = { id: "device-1", userId: "user-1", name: "ESP32", lastSeenAt, garden: { name: "Roof" } };
  const store = {
    device: { findMany: async () => status === "ONLINE" ? [candidate] : [] },
    $transaction: async (fn: any) => fn({
      device: { updateMany: async () => {
        if (status !== "ONLINE") return { count: 0 };
        status = "OFFLINE";
        return { count: 1 };
      } },
      telegramDelivery: { createMany: async (value: any) => { enqueued.push(value); return { count: 1 }; } },
      notification: { create: async (value: any) => { inApp.push(value); return value.data; } },
    }),
  };
  const [first, second] = await Promise.all([
    runDeviceOfflineMonitor({ now, limit: 1, env: { DEVICE_OFFLINE_THRESHOLD_SECONDS: "900" }, store: store as never }),
    runDeviceOfflineMonitor({ now, limit: 1, env: { DEVICE_OFFLINE_THRESHOLD_SECONDS: "900" }, store: store as never }),
  ]);
  assert.equal(first.transitioned + second.transitioned, 1);
  assert.equal(status, "OFFLINE");
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].data.eventKey, deviceOfflineEventKey("device-1", lastSeenAt));
  assert.equal(inApp.length, 1);
  assert.equal(inApp[0].data.title, "ESP32 went offline");
});

test("valid ingestion atomically records a recovery only from the OFFLINE state", () => {
  const ingest = readFileSync(resolve(process.cwd(), "src/app/api/iot/ingest/route.ts"), "utf8");
  assert.match(ingest, /where: \{ id: device\.id, status: "OFFLINE" \}/);
  assert.match(ingest, /eventType: "DEVICE_RECOVERED"/);
  assert.match(ingest, /deviceRecoveryEventKey/);
});
