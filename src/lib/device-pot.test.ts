import assert from "node:assert/strict";
import test from "node:test";
import { pickPotForReading } from "./device-pot";

test("uses the device's connected pot when it has exactly one", () => {
  assert.equal(pickPotForReading({ mappedPotIds: ["pot-b"] }), "pot-b");
});

test("never links a disconnected device to a pot by itself", () => {
  assert.equal(pickPotForReading({ mappedPotIds: [] }), null);
});

test("is ambiguous for a device connected to several pots", () => {
  assert.equal(pickPotForReading({ mappedPotIds: ["pot-a", "pot-b"] }), null);
});
