import assert from "node:assert/strict";
import test from "node:test";
import { PLANT_CATALOG, findPlantProfile, isSamePlant } from "./plant-catalog";

test("finds plants by name or local alias, ignoring case and spacing", () => {
  assert.equal(findPlantProfile("tomato")?.name, "Tomato");
  assert.equal(findPlantProfile("  Brinjal ")?.name, "Eggplant");
  assert.equal(findPlantProfile("lal  shak")?.name, "Red amaranth");
  assert.equal(findPlantProfile("Venus flytrap"), undefined);
});

test("treats aliases as the same plant when counting", () => {
  assert.ok(isSamePlant("Eggplant", "brinjal"));
  assert.ok(isSamePlant("Venus flytrap", "venus flytrap"));
  assert.ok(!isSamePlant("Tomato", "Chili"));
});

test("every profile has a sensible watering band", () => {
  for (const plant of PLANT_CATALOG) {
    assert.ok(plant.moisture[0] < plant.moisture[1], `${plant.name} moisture band`);
    assert.ok(plant.ph[0] <= plant.ph[1], `${plant.name} pH range`);
  }
});

test("names and aliases are unique so every search finds one plant", () => {
  const seen = new Map<string, string>();
  for (const plant of PLANT_CATALOG) {
    for (const key of [plant.name, ...(plant.aliases ?? [])]) {
      const norm = key.trim().toLowerCase();
      assert.ok(!seen.has(norm), `"${key}" is used by both ${seen.get(norm)} and ${plant.name}`);
      seen.set(norm, plant.name);
    }
  }
});

test("finds common Dhaka balcony plants by local names", () => {
  assert.equal(findPlantProfile("Joba")?.name, "Hibiscus");
  assert.equal(findPlantProfile("money plant")?.category, "Indoor");
  assert.equal(findPlantProfile("Pui shak")?.name, "Malabar spinach");
  assert.equal(findPlantProfile("Tulsi")?.name, "Tulsi");
});
