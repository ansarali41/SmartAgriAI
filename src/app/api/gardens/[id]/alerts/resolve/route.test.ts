import assert from "node:assert/strict";
import test from "node:test";
import { DELETE, POST } from "./route";

const context = { params: Promise.resolve({ id: "garden-a" }) };
const request = (method: string) =>
  new Request("http://localhost/api/gardens/garden-a/alerts/resolve", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alertId: "dry-pot-a" }),
  });

test("resolving an alert requires a logged-in user", async () => {
  const response = await POST(request("POST"), context);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Unauthorized");
});

test("un-resolving an alert requires a logged-in user", async () => {
  const response = await DELETE(request("DELETE"), context);
  assert.equal(response.status, 401);
});
