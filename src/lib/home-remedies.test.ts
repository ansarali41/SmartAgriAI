import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { diseaseKey, remedyPlanFor } from "./home-remedies";

const classNames = readFileSync(resolve(process.cwd(), "services/ai/models/class_names.txt"), "utf8")
  .split("\n")
  .filter((line) => line.includes(":"))
  .map((line) => line.split(":").slice(1).join(":").trim());

test("normalises model class names", () => {
  assert.equal(diseaseKey("Tomato___Spider_mites Two-spotted_spider_mite"), "spider_mites_two_spotted_spider_mite");
  assert.equal(diseaseKey("Orange___Haunglongbing_(Citrus_greening)"), "haunglongbing_citrus_greening");
  assert.equal(diseaseKey("Late Blight"), "late_blight");
});

test("every class the model knows gets a specific plan, not the generic one", () => {
  const generic = remedyPlanFor("Something___Unknown_thing");
  for (const name of classNames) {
    const plan = remedyPlanFor(name);
    assert.notEqual(plan, generic, `${name} falls back to the generic plan`);
    assert.ok(plan.remedies.length > 0 && plan.firstSteps.length > 0, name);
    if (name.endsWith("healthy")) assert.equal(plan.kind, "healthy", name);
  }
});

test("viruses say there is no cure and to remove the plant", () => {
  const plan = remedyPlanFor("Tomato___Tomato_Yellow_Leaf_Curl_Virus");
  assert.equal(plan.kind, "viral");
  assert.match(plan.escalate ?? "", /Remove/);
});
