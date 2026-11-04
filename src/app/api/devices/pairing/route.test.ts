import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "./route";

test("listing boards waiting to be claimed requires a logged-in user", async () => {
  const response = await GET(new Request("http://localhost/api/devices/pairing"));
  assert.equal(response.status, 401);
});

test("claiming a board requires a logged-in user", async () => {
  const response = await POST(
    new Request("http://localhost/api/devices/pairing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hardwareId: "ESP32-ABCDEF", pairingCode: "123456", gardenId: "g", name: "n" }),
    }),
  );
  assert.equal(response.status, 401);
});
