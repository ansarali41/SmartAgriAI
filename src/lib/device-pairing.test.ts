import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIRM_WINDOW_MS,
  announceAction,
  isConfirmPending,
  hashPairingSecret,
  isPairingVisible,
  isValidHardwareId,
  normalizePairingCode,
  pairingCodesMatch,
} from "./device-pairing";

test("normalizes pairing codes typed with spaces or dashes", () => {
  assert.equal(normalizePairingCode("482 913"), "482913");
  assert.equal(normalizePairingCode("482-913"), "482913");
  assert.equal(normalizePairingCode("48291"), null);
  assert.equal(normalizePairingCode("abcdef"), null);
});

test("compares pairing codes exactly", () => {
  assert.ok(pairingCodesMatch("482913", "482913"));
  assert.ok(!pairingCodesMatch("482913", "482914"));
  assert.ok(!pairingCodesMatch("482913", "48291"));
});

test("validates hardware IDs", () => {
  assert.ok(isValidHardwareId("ESP32-D299AC"));
  assert.ok(!isValidHardwareId("a b"));
  assert.ok(!isValidHardwareId("x"));
});

test("decides whether to reset, wait or deliver on announce", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const secretHash = hashPairingSecret("abcdefghijklmnop");
  const base = { secretHash, claimedAt: null, pendingKey: null, keyExpiresAt: null };
  assert.equal(announceAction(null, secretHash, now), "reset");
  assert.equal(announceAction(base, hashPairingSecret("different-secret!"), now), "reset");
  assert.equal(announceAction(base, secretHash, now), "wait");
  const claimed = { ...base, claimedAt: now, pendingKey: "sk_dev_x", keyExpiresAt: new Date(now.getTime() + 60_000) };
  assert.equal(announceAction(claimed, secretHash, now), "deliver");
  assert.equal(announceAction({ ...claimed, keyExpiresAt: new Date(now.getTime() - 1) }, secretHash, now), "reset");
  assert.equal(announceAction({ ...claimed, pendingKey: null }, secretHash, now), "reset");
});

test("hides boards that stopped checking in (switched off)", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  assert.ok(isPairingVisible(new Date(now.getTime() - 8_000), now));
  assert.ok(!isPairingVisible(new Date(now.getTime() - 45_000), now));
});

test("a button-press request is only valid for a short window", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  assert.ok(isConfirmPending(new Date(now.getTime() - 5_000), now));
  assert.ok(!isConfirmPending(new Date(now.getTime() - CONFIRM_WINDOW_MS - 1), now));
  assert.ok(!isConfirmPending(null, now));
});
