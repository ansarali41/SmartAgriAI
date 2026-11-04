// Device pairing ("claim") helpers. A board without a key announces itself
// with its hardware ID, a random secret and a 6-digit pairing code it shows
// the user. The user claims it in the app by typing that code; the board then
// collects its device key once. See /api/iot/pair and /api/devices/pairing.
import crypto from "node:crypto";

/**
 * Boards waiting to be added check in every few seconds (4 s, or 1 s while
 * confirming). If one has been silent this long it's switched off or lost
 * Wi-Fi, so it's hidden from "New devices found" and can't be claimed.
 */
export const PAIRING_VISIBLE_MS = 30 * 1000;
/** A claimed board must collect its key within this window. */
export const KEY_DELIVERY_TTL_MS = 15 * 60 * 1000;
/** Wrong codes allowed before the user must press "new code" on the board. */
export const MAX_FAILED_ATTEMPTS = 5;
/** How long the board waits for its BOOT button after the app asks. */
export const CONFIRM_WINDOW_MS = 30 * 1000;

const HARDWARE_ID = /^[A-Za-z0-9_-]{3,64}$/;
const PAIRING_CODE = /^\d{6}$/;
const SECRET = /^[A-Za-z0-9]{16,128}$/;

export function isValidHardwareId(value: string) {
  return HARDWARE_ID.test(value);
}

export function isValidSecret(value: string) {
  return SECRET.test(value);
}

/** Accepts "482 913", "482-913" etc.; returns the 6 digits or null. */
export function normalizePairingCode(input: string) {
  const digits = input.replace(/\D/g, "");
  return PAIRING_CODE.test(digits) ? digits : null;
}

export function hashPairingSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Constant-time comparison so codes can't be guessed by timing. */
export function pairingCodesMatch(expected: string, provided: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isPairingVisible(lastSeenAt: Date, now = new Date()) {
  return now.getTime() - lastSeenAt.getTime() <= PAIRING_VISIBLE_MS;
}

export type PairingState = {
  secretHash: string;
  claimedAt: Date | null;
  pendingKey: string | null;
  keyExpiresAt: Date | null;
};

/**
 * What to do when a board announces itself:
 *  - "reset":   new secret (board restarted unpaired) — forget any old claim.
 *  - "deliver": it was claimed and its key is ready — hand it over once.
 *  - "wait":    keep waiting for the user to claim it.
 */
export function announceAction(existing: PairingState | null, secretHash: string, now = new Date()) {
  if (!existing || existing.secretHash !== secretHash) return "reset" as const;
  if (existing.claimedAt && existing.pendingKey && existing.keyExpiresAt && existing.keyExpiresAt > now) {
    return "deliver" as const;
  }
  if (existing.claimedAt) return "reset" as const; // key expired or already taken; start over
  return "wait" as const;
}

/** The app asked the user to press the board's button, and it's not too late. */
export function isConfirmPending(confirmRequestedAt: Date | null, now = new Date()) {
  return Boolean(confirmRequestedAt && now.getTime() - confirmRequestedAt.getTime() <= CONFIRM_WINDOW_MS);
}
