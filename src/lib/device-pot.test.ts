import assert from "node:assert/strict";
import test from "node:test";
import { pickPotForReading } from "./device-pot";

test("uses the device's connected pot when it has exactly one", () => {
  assert.equal(pickPotForReading({ mappedPotIds: ["pot-b"], gardenPotIds: ["pot-a", "pot-b", "pot-c"] }), "pot-b");
});

test("falls back to the garden's only pot for an unconnected device", () => {
  assert.equal(pickPotForReading({ mappedPotIds: [], gardenPotIds: ["pot-a"] }), "pot-a");
});

test("is ambiguous for a multi-pot device or a multi-pot garden", () => {
  assert.equal(pickPotForReading({ mappedPotIds: ["pot-a", "pot-b"], gardenPotIds: ["pot-a", "pot-b"] }), null);
  assert.equal(pickPotForReading({ mappedPotIds: [], gardenPotIds: ["pot-a", "pot-b"] }), null);
});
