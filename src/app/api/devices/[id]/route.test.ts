import assert from "node:assert/strict";
import test from "node:test";
import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ id: "device-a" }) };

test("assigning a device requires a logged-in user", async () => {
  const response = await PATCH(
    new Request("http://localhost/api/devices/device-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gardenId: null }),
    }),
    context,
  );
  assert.equal(response.status, 401);
});

test("deleting a device requires a logged-in user", async () => {
  const response = await DELETE(new Request("http://localhost/api/devices/device-a", { method: "DELETE" }), context);
  assert.equal(response.status, 401);
});
