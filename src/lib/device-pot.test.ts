import assert from "node:assert/strict";
import test from "node:test";
import { firstFreePort, pickPotForReading } from "./device-pot";

test("single-pot firmware (no port): uses the device's only connected pot", () => {
  assert.equal(pickPotForReading({ links: [{ potId: "pot-b", port: 1 }] }), "pot-b");
});

test("never links a disconnected device to a pot by itself", () => {
  assert.equal(pickPotForReading({ links: [] }), null);
  assert.equal(pickPotForReading({ links: [], port: 1 }), null);
});

test("without a port, a board with several pots is ambiguous", () => {
  assert.equal(pickPotForReading({ links: [{ potId: "pot-a", port: 1 }, { potId: "pot-b", port: 2 }] }), null);
});

test("with a port, each reading goes to the pot on that port", () => {
  const links = [{ potId: "pot-a", port: 1 }, { potId: "pot-c", port: 3 }];
  assert.equal(pickPotForReading({ links, port: 1 }), "pot-a");
  assert.equal(pickPotForReading({ links, port: 3 }), "pot-c");
  assert.equal(pickPotForReading({ links, port: 2 }), null); // port 2 not connected
});

test("finds the lowest free port, within the board's port count (max 6)", () => {
  assert.equal(firstFreePort([], 1), 1);
  assert.equal(firstFreePort([1], 1), null);
  assert.equal(firstFreePort([1, 2], 4), 3);
  assert.equal(firstFreePort([2], 4), 1);
  assert.equal(firstFreePort([1, 2, 3, 4, 5, 6], 10), null);
});

test("ports can be added from the app on firmware 2.9+", async () => {
  const { supportsRemotePorts } = await import("./device-pot");
  assert.equal(supportsRemotePorts("smartagri-2.9"), true);
  assert.equal(supportsRemotePorts("smartagri-3.0"), true);
  assert.equal(supportsRemotePorts("smartagri-2.8"), false);
  assert.equal(supportsRemotePorts(null), false);
});
