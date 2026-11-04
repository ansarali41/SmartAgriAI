import assert from "node:assert/strict";
import test from "node:test";
import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ id: "pot-a" }) };

test("editing a pot requires a logged-in user", async () => {
  const response = await PATCH(
    new Request("http://localhost/api/pots/pot-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "POT-02" }),
    }),
    context,
  );
  assert.equal(response.status, 401);
});

test("deleting a pot requires a logged-in user", async () => {
  const response = await DELETE(new Request("http://localhost/api/pots/pot-a", { method: "DELETE" }), context);
  assert.equal(response.status, 401);
});
