import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

test("server address lookup requires a logged-in user", async () => {
  const response = await GET(new Request("http://localhost:3000/api/server-info"));
  assert.equal(response.status, 401);
});
