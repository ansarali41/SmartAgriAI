import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

test("adding a pot and plant requires a logged-in user", async () => {
  const response = await POST(
    new Request("http://localhost/api/gardens/garden-a/plantings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ id: "garden-a" }) },
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Unauthorized");
});
