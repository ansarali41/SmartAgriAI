import assert from "node:assert/strict";
import test from "node:test";
import { DELETE, POST } from "./route";

const context = { params: Promise.resolve({ id: "pot-a" }) };
const request = (method: string) =>
  new Request("http://localhost/api/pots/pot-a/devices", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: "device-a" }),
  });

test("connecting a device to a pot requires a logged-in user", async () => {
  const response = await POST(request("POST"), context);
  assert.equal(response.status, 401);
});

test("disconnecting a device from a pot requires a logged-in user", async () => {
  const response = await DELETE(request("DELETE"), context);
  assert.equal(response.status, 401);
});
