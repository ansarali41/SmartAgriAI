import assert from "node:assert/strict";
import test from "node:test";
import { applyAlertResolutions, buildGardenAlerts } from "./garden-alerts";

test("builds garden-scoped alerts from real dashboard records", () => {
  const alerts = buildGardenAlerts({
    gardenId: "garden-a",
    pots: [{ id: "pot-a", label: "POT-01", plant: { id: "plant-a", commonName: "Tomato" }, moisture: 20, moistureOnThreshold: 30 }],
    devices: [{ id: "device-a", name: "ESP32", status: "OFFLINE" }],
    weather: { current: { rain: 0, rainProb: 80 } },
    latestPredictions: [{ potId: "pot-a", plantId: "plant-a", predictedDisease: "Leaf Mold", className: "Tomato___Leaf_Mold" }],
    failedCommands: [{ id: "command-a", potId: "pot-a", error: "Valve timeout" }],
  });
  assert.equal(alerts.length, 5);
  assert.ok(alerts.every((alert) => alert.gardenId === "garden-a"));
  assert.deepEqual(alerts.filter((alert) => alert.potId).map((alert) => alert.potId), ["pot-a", "pot-a", "pot-a"]);
});

test("does not create moisture or disease alerts for an empty pot", () => {
  const alerts = buildGardenAlerts({
    gardenId: "garden-a", pots: [{ id: "pot-empty", label: "POT-02", plant: null, moisture: null, moistureOnThreshold: 30 }],
    devices: [], weather: null, latestPredictions: [], failedCommands: [],
  });
  assert.deepEqual(alerts, []);
});

test("keys disease alerts by prediction so a new diagnosis alerts again", () => {
  const input = {
    gardenId: "garden-a", pots: [], devices: [], weather: null, failedCommands: [],
  };
  const first = buildGardenAlerts({ ...input, latestPredictions: [{ id: "pred-1", potId: "pot-a", plantId: "plant-a", predictedDisease: "Early Blight", className: null }] });
  const second = buildGardenAlerts({ ...input, latestPredictions: [{ id: "pred-2", potId: "pot-a", plantId: "plant-a", predictedDisease: "Early Blight", className: null }] });
  assert.equal(first[0].id, "disease-pot-a-pred-1");
  assert.notEqual(first[0].id, second[0].id);
});

test("hides resolved alerts and reports resolutions whose condition cleared", () => {
  const alerts = buildGardenAlerts({
    gardenId: "garden-a",
    pots: [{ id: "pot-a", label: "POT-01", plant: null, moisture: 10, moistureOnThreshold: 30 }],
    devices: [{ id: "device-a", name: "ESP32", status: "OFFLINE" }],
    weather: null, latestPredictions: [], failedCommands: [],
  });
  const result = applyAlertResolutions(alerts, ["dry-pot-a", "offline-device-gone"]);
  assert.deepEqual(result.alerts.map((alert) => alert.id), ["offline-device-a"]);
  assert.equal(result.resolvedCount, 1);
  assert.deepEqual(result.stale, ["offline-device-gone"]);
});

test("returns resolved alerts with when they were resolved", () => {
  const alerts = buildGardenAlerts({
    gardenId: "garden-a",
    pots: [{ id: "pot-a", label: "POT-01", plant: null, moisture: 10, moistureOnThreshold: 30 }],
    devices: [], weather: null, latestPredictions: [], failedCommands: [],
  });
  const at = new Date("2026-11-04T10:00:00Z");
  const result = applyAlertResolutions(alerts, [{ alertKey: "dry-pot-a", resolvedAt: at }]);
  assert.equal(result.alerts.length, 0);
  assert.equal(result.resolved[0].id, "dry-pot-a");
  assert.equal(result.resolved[0].resolvedAt, at);
});
