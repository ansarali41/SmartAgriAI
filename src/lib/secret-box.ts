// Small authenticated encryption helper for secrets stored in the database
// (e.g. a user's Telegram bot token). AES-256-GCM with a key derived from
// AUTH_SECRET. Changing AUTH_SECRET makes stored secrets unreadable — they'd
// need to be entered again.
import crypto from "node:crypto";

function key() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return crypto.scryptSync(secret, "smartagri:secret-box:v1", 32);
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function sealSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Returns null if the value was tampered with or sealed with a different key. */
export function openSecret(sealed: string): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
