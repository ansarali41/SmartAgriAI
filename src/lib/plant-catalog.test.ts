import assert from "node:assert/strict";
import test from "node:test";
import { PLANT_CATALOG, findPlantProfile, isSamePlant } from "./plant-catalog";

test("finds plants by name or local alias, ignoring case and spacing", () => {
  assert.equal(findPlantProfile("tomato")?.name, "Tomato");
  assert.equal(findPlantProfile("  Brinjal ")?.name, "Eggplant");
  assert.equal(findPlantProfile("lal  shak")?.name, "Red amaranth");
  assert.equal(findPlantProfile("Dragon fruit"), undefined);
});

test("treats aliases as the same plant when counting", () => {
  assert.ok(isSamePlant("Eggplant", "brinjal"));
  assert.ok(isSamePlant("Dragon fruit", "dragon fruit"));
  assert.ok(!isSamePlant("Tomato", "Chili"));
});

test("every profile has a sensible watering band", () => {
  for (const plant of PLANT_CATALOG) {
    assert.ok(plant.moisture[0] < plant.moisture[1], `${plant.name} moisture band`);
    assert.ok(plant.ph[0] <= plant.ph[1], `${plant.name} pH range`);
  }
});
