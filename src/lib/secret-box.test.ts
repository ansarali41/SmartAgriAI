import assert from "node:assert/strict";
import test from "node:test";

import { openSecret, sealSecret } from "./secret-box";

// The key is derived lazily on each call, so setting it here is enough.
process.env.AUTH_SECRET ||= "test-secret-for-secret-box";

test("seals and opens a secret; ciphertext differs each time", () => {
  const a = sealSecret("123456789:ABCdef_secret");
  const b = sealSecret("123456789:ABCdef_secret");
  assert.notEqual(a, b);
  assert.ok(!a.includes("ABCdef"));
  assert.equal(openSecret(a), "123456789:ABCdef_secret");
});

test("tampered or malformed values don't open", () => {
  const sealed = sealSecret("token");
  const parts = sealed.split(".");
  parts[3] = Buffer.from("other").toString("base64url");
  assert.equal(openSecret(parts.join(".")), null);
  assert.equal(openSecret("garbage"), null);
});
