// Home remedies for the leaf diseases the AI model recognises: simple sprays
// and care steps made from things most homes in Bangladesh already have
// (neem leaves, garlic, green chilli, baking soda, milk, wood ash, cinnamon).
// Keyed by the model's class name ("Tomato___Late_blight" → "late_blight").

export interface HomeRemedy {
  id: string;
  name: string;
  /** Local name, shown as a hint. */
  localName?: string;
  /** What it does, in one line. */
  why: string;
  ingredients: string[];
  steps: string[];
  /** How often / when to use it. */
  schedule: string;
  caution?: string;
}

export type DiseaseKind = "healthy" | "fungal" | "bacterial" | "viral" | "pest" | "care";

export interface RemedyPlan {
  kind: DiseaseKind;
  /** One sentence: what this is and how worried to be. */
  summary: string;
  /** Do these first, today. */
  firstSteps: string[];
  remedies: HomeRemedy[];
  /** When to stop home care and get help / remove the plant. */
  escalate?: string;
}

const REMEDIES: Record<string, HomeRemedy> = {
  removeLeaves: {
    id: "removeLeaves",
    name: "Remove sick leaves",
    why: "Stops spores spreading from the worst leaves to healthy ones.",
    ingredients: ["Clean scissors", "A plastic bag", "Soap water or Dettol to clean the blade"],
    steps: [
      "Cut off every leaf with spots, plus any fallen leaves on the soil.",
      "Put them straight into a bag and throw it away — don't compost them.",
      "Wipe the scissors with soap water or Dettol after each plant.",
    ],
    schedule: "Today, then check every 2–3 days.",
  },
  neemSpray: {
    id: "neemSpray",
    name: "Neem leaf spray",
    localName: "নিম পাতার স্প্রে",
    why: "Neem slows fungus and keeps sap-sucking insects away.",
    ingredients: ["1 handful fresh neem leaves (about 50 g)", "1 litre water", "2–3 drops liquid dish soap"],
    steps: [
      "Boil the neem leaves in the water for 15 minutes.",
      "Leave it to cool overnight, then strain into a spray bottle.",
      "Add the soap drops and shake — soap helps it stick to leaves.",
      "Spray the top and underside of every leaf until wet.",
    ],
    schedule: "Every 5–7 days in the evening, for 3–4 weeks.",
    caution: "Ready-made neem oil works too: 5 ml neem oil + 2 ml liquid soap in 1 litre water.",
  },
  bakingSoda: {
    id: "bakingSoda",
    name: "Baking soda spray",
    localName: "খাবার সোডা স্প্রে",
    why: "Makes the leaf surface less friendly to fungus.",
    ingredients: ["1 teaspoon baking soda (about 5 g)", "1 litre water", "3–4 drops liquid dish soap"],
    steps: [
      "Mix the baking soda into the water until fully dissolved.",
      "Add the soap and pour into a spray bottle.",
      "Spray all leaves, especially around the spots.",
    ],
    schedule: "Once a week, in the evening.",
    caution: "Don't add more soda — too strong burns leaves. Test on one leaf first and wait a day.",
  },
  milkSpray: {
    id: "milkSpray",
    name: "Milk spray",
    localName: "দুধ বা ঘোল স্প্রে",
    why: "Proven against powdery mildew — milk proteins fight the white fungus in sunlight.",
    ingredients: ["1 cup milk (or ghol / buttermilk)", "2 cups water"],
    steps: ["Mix 1 part milk with 2 parts water.", "Spray the white patches and the leaves around them."],
    schedule: "Twice a week in the morning sun, for 3 weeks.",
  },
  garlicChili: {
    id: "garlicChili",
    name: "Garlic & green chilli spray",
    localName: "রসুন-কাঁচা মরিচ স্প্রে",
    why: "Repels mites and insects and has a mild anti-bacterial effect.",
    ingredients: ["1 garlic bulb (8–10 cloves)", "2 green chillies", "1 litre water", "3 drops liquid dish soap"],
    steps: [
      "Blend the garlic and chillies with a little of the water.",
      "Add the rest of the water and leave overnight.",
      "Strain through a cloth, add the soap, and spray leaves — undersides too.",
    ],
    schedule: "Every 5 days, in the evening.",
    caution: "Wear gloves and keep it away from eyes. Wash vegetables well before eating.",
  },
  soapWater: {
    id: "soapWater",
    name: "Soap water wash",
    why: "Washes off mites and soft insects and breaks their protective coat.",
    ingredients: ["1 teaspoon mild liquid soap", "1 litre water"],
    steps: [
      "First spray the plant hard with plain water to knock pests off.",
      "Then spray the soap water on the undersides of the leaves.",
      "Rinse with plain water the next morning.",
    ],
    schedule: "Every 3 days for 2 weeks.",
  },
  stickyTrap: {
    id: "stickyTrap",
    name: "Yellow sticky trap",
    why: "Catches whiteflies and other insects that carry plant viruses.",
    ingredients: ["A yellow plastic sheet or yellow card", "Vaseline or a little cooking oil", "A stick"],
    steps: ["Smear a thin layer of Vaseline or oil on both sides of the yellow card.", "Fix it on a stick just above the plants."],
    schedule: "Replace when it's covered in insects (about every 2 weeks).",
  },
  woodAsh: {
    id: "woodAsh",
    name: "Wood ash & mulch",
    localName: "ছাই ও মালচ",
    why: "Stops soil splashing spores onto lower leaves; ash adds potassium.",
    ingredients: ["Sieved wood ash (chai)", "Dry leaves or straw"],
    steps: [
      "Sprinkle a thin ring of ash on the soil around the stem — not on the leaves.",
      "Cover the soil with a layer of dry leaves or straw.",
    ],
    schedule: "Once now; top up the mulch every month.",
  },
  cinnamon: {
    id: "cinnamon",
    name: "Cinnamon dusting",
    localName: "দারুচিনি গুঁড়া",
    why: "Natural antifungal that protects cut wounds and the soil surface.",
    ingredients: ["Cinnamon powder (dalchini)"],
    steps: ["After cutting off sick leaves, dust a pinch of cinnamon on the cuts.", "Sprinkle a light layer on the soil surface."],
    schedule: "Each time you prune.",
  },
  handHygiene: {
    id: "handHygiene",
    name: "Clean hands & tools",
    why: "Mosaic viruses spread on hands and tools from plant to plant.",
    ingredients: ["Soap", "Milk (for dipping hands/tools)"],
    steps: [
      "Wash hands with soap before touching other plants.",
      "Dip tools (and hands) in milk before handling healthy plants — it blocks the virus.",
      "Don't smoke near the plants: tobacco carries mosaic virus.",
    ],
    schedule: "Every time you work with the plants.",
  },
  airflow: {
    id: "airflow",
    name: "Dry leaves, good airflow",
    why: "Fungus needs wet leaves; drying them out is the cheapest cure.",
    ingredients: ["Nothing to buy"],
    steps: [
      "Water the soil only, never the leaves — water in the morning.",
      "Move pots apart so air flows between them.",
      "Trim crowded inner branches.",
    ],
    schedule: "Every day.",
  },
  compostTea: {
    id: "compostTea",
    name: "Compost feed",
    localName: "জৈব সার",
    why: "A well-fed plant fights disease better.",
    ingredients: ["Vermicompost or kitchen compost", "Water"],
    steps: ["Mix 2 handfuls of compost into the top soil.", "Water well afterwards."],
    schedule: "Once a month.",
  },
};

const r = (...ids: (keyof typeof REMEDIES)[]) => ids.map((id) => REMEDIES[id]);

const FUNGAL_STEPS = [
  "Move the pot away from your other plants.",
  "Cut off and bin the spotted leaves.",
  "Water only the soil, in the morning — keep leaves dry.",
];

const PLANS: Record<string, RemedyPlan> = {
  healthy: {
    kind: "healthy",
    summary: "No disease found. Keep it that way with a little routine care.",
    firstSteps: ["Nothing urgent — keep watering on schedule.", "Check the undersides of leaves once a week."],
    remedies: r("neemSpray", "compostTea", "airflow"),
  },
  late_blight: {
    kind: "fungal",
    summary: "A fast-spreading water mould. Act today — it can kill a plant within a week in humid weather.",
    firstSteps: FUNGAL_STEPS,
    remedies: r("removeLeaves", "bakingSoda", "neemSpray", "airflow"),
    escalate: "If more than a third of the plant is affected, remove the whole plant so it doesn't spread to others.",
  },
  early_blight: {
    kind: "fungal",
    summary: "A common fungus that starts on the lower leaves. Slow-moving and manageable at home.",
    firstSteps: FUNGAL_STEPS,
    remedies: r("removeLeaves", "woodAsh", "bakingSoda", "neemSpray", "cinnamon"),
  },
  septoria_leaf_spot: {
    kind: "fungal",
    summary: "A fungus that makes many small spots on lower leaves. Manageable if caught early.",
    firstSteps: FUNGAL_STEPS,
    remedies: r("removeLeaves", "woodAsh", "bakingSoda", "neemSpray"),
  },
  target_spot: {
    kind: "fungal",
    summary: "A fungus that makes ringed spots. Keep leaves dry and remove the worst ones.",
    firstSteps: FUNGAL_STEPS,
    remedies: r("removeLeaves", "bakingSoda", "neemSpray", "airflow"),
  },
  leaf_mold: {
    kind: "fungal",
    summary: "A fungus that loves humid, still air — common on balconies in the monsoon.",
    firstSteps: ["Move the pot somewhere with more air and morning sun.", ...FUNGAL_STEPS.slice(1)],
    remedies: r("airflow", "removeLeaves", "bakingSoda", "neemSpray"),
  },
  powdery_mildew: {
    kind: "fungal",
    summary: "White powder on leaves. Easy to treat at home — milk spray works well.",
    firstSteps: ["Cut off the leaves that are mostly white.", "Give the plant more sun and space."],
    remedies: r("milkSpray", "bakingSoda", "neemSpray", "airflow"),
  },
  bacterial_spot: {
    kind: "bacterial",
    summary: "Bacteria spread by water splashes. It can't be cured, but you can stop it spreading.",
    firstSteps: ["Stop splashing water on the leaves.", "Cut off spotted leaves with clean scissors.", "Don't touch the plant while it's wet."],
    remedies: r("removeLeaves", "garlicChili", "woodAsh", "airflow"),
    escalate: "If the fruit gets spots too, ask a local agriculture officer about a copper spray.",
  },
  spider_mites_two_spotted_spider_mite: {
    kind: "pest",
    summary: "Tiny mites under the leaves cause speckled, dusty leaves. Common in hot, dry weather.",
    firstSteps: ["Spray the leaf undersides hard with plain water.", "Move the pot away from other plants.", "Mist around the plant — mites hate humidity."],
    remedies: r("soapWater", "neemSpray", "garlicChili"),
  },
  tomato_yellow_leaf_curl_virus: {
    kind: "viral",
    summary: "A virus spread by whiteflies. There's no cure — protect your other plants.",
    firstSteps: ["Pull out and bin the infected plant (don't compost it).", "Check other plants for tiny white flies under the leaves."],
    remedies: r("stickyTrap", "neemSpray", "handHygiene"),
    escalate: "Remove the plant — it won't recover and will keep infecting others.",
  },
  tomato_mosaic_virus: {
    kind: "viral",
    summary: "A virus that spreads on hands and tools. No cure — stop it reaching other plants.",
    firstSteps: ["Remove and bin the infected plant.", "Wash hands with soap before touching other plants."],
    remedies: r("handHygiene", "removeLeaves"),
    escalate: "Remove the plant — it won't recover.",
  },
  haunglongbing_citrus_greening: {
    kind: "viral",
    summary: "A serious citrus disease spread by tiny insects (psyllids). There's no cure.",
    firstSteps: ["Remove the infected tree or plant.", "Check nearby citrus for small insects on new shoots."],
    remedies: r("neemSpray", "stickyTrap"),
    escalate: "Tell your local agriculture office — this disease spreads between gardens.",
  },
};

// Broader groups an online AI (Gemini / Groq) can answer with, for plants and
// problems the plans above don't name.
PLANS.other_viral = {
  kind: "viral",
  summary: "Looks like a plant virus. There's no cure — keep it away from your other plants.",
  firstSteps: ["Move the pot away from other plants.", "Remove the worst leaves, or the whole plant if most of it is affected.", "Wash hands and tools after touching it."],
  remedies: r("handHygiene", "stickyTrap", "removeLeaves"),
  escalate: "If it keeps spreading, remove the plant so it doesn't infect others.",
};
PLANS.other_pest = {
  kind: "pest",
  summary: "Insects or mites are feeding on the plant. Wash them off and treat weekly.",
  firstSteps: ["Check the undersides of leaves and new shoots.", "Wash the pests off with a strong spray of water.", "Move the pot away from other plants."],
  remedies: r("soapWater", "neemSpray", "garlicChili", "stickyTrap"),
};
PLANS.care_problem = {
  kind: "care",
  summary: "Not a disease — the plant is reacting to its care: water, light, food or temperature.",
  firstSteps: [
    "Feel the soil 2 cm down: water only when it's dry there, and make sure the pot drains.",
    "Check the light: move it out of harsh afternoon sun, or closer to a window if it's stretching.",
    "Trim the worst leaves — they won't turn green again.",
  ],
  remedies: r("compostTea", "airflow"),
};

// Diseases that behave like one of the plans above.
const ALIASES: Record<string, string> = {
  apple_scab: "early_blight",
  black_rot: "early_blight",
  cedar_apple_rust: "target_spot",
  common_rust_: "target_spot",
  cercospora_leaf_spot_gray_leaf_spot: "septoria_leaf_spot",
  northern_leaf_blight: "early_blight",
  esca_black_measles: "early_blight",
  leaf_blight_isariopsis_leaf_spot: "septoria_leaf_spot",
  leaf_scorch: "septoria_leaf_spot",
  other_bacterial: "bacterial_spot",
};

const GENERIC: RemedyPlan = {
  kind: "fungal",
  summary: "Treat it like a leaf fungus: dry leaves, remove the worst ones, and spray weekly.",
  firstSteps: FUNGAL_STEPS,
  remedies: r("removeLeaves", "neemSpray", "bakingSoda", "airflow"),
};

/** "Tomato___Spider_mites Two-spotted_spider_mite" → "spider_mites_two_spotted_spider_mite" */
export function diseaseKey(classNameOrDisease: string) {
  const part = classNameOrDisease.split("___").pop() ?? classNameOrDisease;
  return part
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[\s-]+/g, "_");
}

export function remedyPlanFor(classNameOrDisease: string): RemedyPlan {
  const key = diseaseKey(classNameOrDisease);
  if (key.includes("healthy")) return PLANS.healthy;
  return PLANS[key] ?? PLANS[ALIASES[key] ?? ""] ?? GENERIC;
}
