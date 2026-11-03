// Growing guidance for common home/field crops, used to recommend a pot's
// soil and watering thresholds when a plant is added. Values are general
// horticultural ranges, not lab-calibrated targets — users can override them.

export type SoilType = "loam" | "clay" | "sandy" | "silt" | "peat" | "potting_mix";

export const SOIL_LABELS: Record<SoilType, string> = {
  loam: "Loam",
  clay: "Clay",
  sandy: "Sandy",
  silt: "Silt",
  peat: "Peat",
  potting_mix: "Potting mix",
};

export interface PlantProfile {
  name: string;
  /** Other names people search by, e.g. "Brinjal" for eggplant. */
  aliases?: string[];
  scientificName: string;
  soil: SoilType;
  soilNote: string;
  ph: [number, number];
  /** Soil moisture comfort band (%): water below the first, stop at the second. */
  moisture: [number, number];
  tempC: [number, number];
  humidity: [number, number];
  sunlight: string;
  tip: string;
}

export const PLANT_CATALOG: PlantProfile[] = [
  { name: "Tomato", scientificName: "Solanum lycopersicum", soil: "loam", soilNote: "Rich, well-drained loam with compost", ph: [6.0, 6.8], moisture: [40, 70], tempC: [18, 30], humidity: [50, 70], sunlight: "Full sun, 6–8 h", tip: "Water at the base; wet leaves invite early and late blight." },
  { name: "Chili", aliases: ["Chilli", "Pepper", "Capsicum", "Morich"], scientificName: "Capsicum annuum", soil: "loam", soilNote: "Well-drained loam, not waterlogged", ph: [6.0, 7.0], moisture: [40, 65], tempC: [20, 30], humidity: [50, 70], sunlight: "Full sun, 6–8 h", tip: "Let the top few cm dry between waterings." },
  { name: "Eggplant", aliases: ["Brinjal", "Begun", "Aubergine"], scientificName: "Solanum melongena", soil: "loam", soilNote: "Deep, fertile loam", ph: [5.5, 6.8], moisture: [45, 70], tempC: [22, 32], humidity: [50, 70], sunlight: "Full sun, 6–8 h", tip: "Keep evenly moist while flowering and fruiting." },
  { name: "Okra", aliases: ["Lady's finger", "Dherosh"], scientificName: "Abelmoschus esculentus", soil: "sandy", soilNote: "Light sandy loam that drains fast", ph: [6.0, 6.8], moisture: [35, 60], tempC: [24, 35], humidity: [50, 70], sunlight: "Full sun", tip: "Tolerates short dry spells better than overwatering." },
  { name: "Cucumber", aliases: ["Shosha"], scientificName: "Cucumis sativus", soil: "loam", soilNote: "Loose loam rich in organic matter", ph: [6.0, 7.0], moisture: [50, 75], tempC: [20, 30], humidity: [60, 80], sunlight: "Full sun", tip: "Needs steady moisture; dry soil makes fruit bitter." },
  { name: "Bottle gourd", aliases: ["Lau", "Calabash"], scientificName: "Lagenaria siceraria", soil: "loam", soilNote: "Fertile, well-drained loam", ph: [6.0, 7.0], moisture: [45, 70], tempC: [24, 32], humidity: [60, 80], sunlight: "Full sun", tip: "Give a trellis and water deeply twice a week." },
  { name: "Bitter gourd", aliases: ["Korola", "Bitter melon"], scientificName: "Momordica charantia", soil: "loam", soilNote: "Sandy loam with compost", ph: [6.0, 6.7], moisture: [45, 70], tempC: [24, 32], humidity: [60, 80], sunlight: "Full sun", tip: "Avoid waterlogging around the roots." },
  { name: "Pumpkin", aliases: ["Misti kumra"], scientificName: "Cucurbita moschata", soil: "loam", soilNote: "Rich loam with plenty of compost", ph: [6.0, 6.8], moisture: [45, 70], tempC: [20, 32], humidity: [50, 75], sunlight: "Full sun", tip: "Water the soil, not the leaves, to limit mildew." },
  { name: "Spinach", aliases: ["Palong shak"], scientificName: "Spinacia oleracea", soil: "silt", soilNote: "Moisture-holding silt or loam", ph: [6.5, 7.5], moisture: [50, 75], tempC: [10, 24], humidity: [50, 70], sunlight: "Full sun to part shade", tip: "Bolts in heat — grow in the cool season." },
  { name: "Red amaranth", aliases: ["Lal shak", "Amaranth"], scientificName: "Amaranthus tricolor", soil: "loam", soilNote: "Well-drained loam", ph: [6.0, 7.0], moisture: [45, 70], tempC: [22, 32], humidity: [50, 75], sunlight: "Full sun", tip: "Fast grower; keep soil lightly moist for tender leaves." },
  { name: "Lettuce", scientificName: "Lactuca sativa", soil: "potting_mix", soilNote: "Light, rich potting mix or loam", ph: [6.0, 7.0], moisture: [55, 75], tempC: [10, 22], humidity: [50, 70], sunlight: "Part shade in hot weather", tip: "Shallow roots — water little and often." },
  { name: "Coriander", aliases: ["Cilantro", "Dhonia"], scientificName: "Coriandrum sativum", soil: "loam", soilNote: "Well-drained loam", ph: [6.2, 6.8], moisture: [40, 65], tempC: [15, 25], humidity: [40, 65], sunlight: "Full sun to part shade", tip: "Prefers cool weather; sow every few weeks for a steady supply." },
  { name: "Mint", aliases: ["Pudina"], scientificName: "Mentha spp.", soil: "potting_mix", soilNote: "Moist, rich potting mix", ph: [6.0, 7.0], moisture: [55, 80], tempC: [15, 28], humidity: [50, 80], sunlight: "Part shade", tip: "Spreads quickly — a pot of its own is ideal." },
  { name: "Basil", aliases: ["Tulsi"], scientificName: "Ocimum basilicum", soil: "potting_mix", soilNote: "Free-draining potting mix", ph: [6.0, 7.0], moisture: [40, 65], tempC: [20, 30], humidity: [40, 70], sunlight: "Full sun, 6 h", tip: "Pinch flower buds to keep leaves coming." },
  { name: "Strawberry", scientificName: "Fragaria × ananassa", soil: "sandy", soilNote: "Sandy loam, slightly acidic", ph: [5.5, 6.5], moisture: [45, 70], tempC: [15, 26], humidity: [60, 75], sunlight: "Full sun", tip: "Mulch to keep fruit off wet soil." },
  { name: "Potato", aliases: ["Alu"], scientificName: "Solanum tuberosum", soil: "sandy", soilNote: "Loose sandy loam for tuber growth", ph: [5.0, 6.0], moisture: [50, 75], tempC: [15, 22], humidity: [60, 80], sunlight: "Full sun", tip: "Even moisture prevents cracked or knobbly tubers." },
  { name: "Aloe vera", aliases: ["Aloe"], scientificName: "Aloe barbadensis miller", soil: "sandy", soilNote: "Gritty, fast-draining cactus mix", ph: [6.0, 8.0], moisture: [15, 35], tempC: [18, 30], humidity: [30, 50], sunlight: "Bright light", tip: "Let the soil dry out fully between waterings." },
  { name: "Rose", aliases: ["Golap"], scientificName: "Rosa spp.", soil: "loam", soilNote: "Rich, well-drained loam", ph: [6.0, 6.5], moisture: [45, 65], tempC: [15, 28], humidity: [40, 70], sunlight: "Full sun, 6 h", tip: "Water deeply but infrequently; keep leaves dry." },
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find a catalog entry by name or alias (case-insensitive). */
export function findPlantProfile(name: string): PlantProfile | undefined {
  const needle = normalize(name);
  if (!needle) return undefined;
  return PLANT_CATALOG.find(
    (plant) => normalize(plant.name) === needle || plant.aliases?.some((alias) => normalize(alias) === needle),
  );
}

/** Same-plant check used for "you already grow N of these" counts. */
export function isSamePlant(a: string, b: string) {
  const profile = findPlantProfile(a);
  if (profile) return findPlantProfile(b) === profile;
  return normalize(a) === normalize(b);
}
