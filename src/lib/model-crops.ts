// The crops the leaf-disease model was trained on (PlantVillage), with the
// names people use for them. Used to tell the AI which crop a pot grows (it
// then only considers that crop's diseases) and to explain results.
export const MODEL_CROPS: Record<string, string[]> = {
  apple: ["apple"],
  blueberry: ["blueberry"],
  cherry: ["cherry"],
  corn: ["corn", "maize", "bhutta"],
  grape: ["grape"],
  orange: ["orange", "lemon", "lime", "citrus", "malta", "lebu"],
  peach: ["peach"],
  pepper: ["pepper", "capsicum", "chili", "chilli", "morich"],
  potato: ["potato", "alu"],
  raspberry: ["raspberry"],
  soybean: ["soybean", "soya"],
  squash: ["squash", "pumpkin", "kumra", "gourd"],
  strawberry: ["strawberry"],
  tomato: ["tomato"],
};

/** Which model crop this plant is ("tomato"), or null when the model doesn't know it. */
export function modelCropFor(plantName: string | null | undefined) {
  const name = (plantName ?? "").toLowerCase();
  if (!name) return null;
  return Object.entries(MODEL_CROPS).find(([, words]) => words.some((word) => name.includes(word)))?.[0] ?? null;
}
