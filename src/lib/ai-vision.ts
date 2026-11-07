// Online vision AI for leaf diagnosis: Google Gemini or Groq (Llama 4 vision).
// Both get the same prompt and must answer with the same JSON, which is mapped
// onto the AiPrediction the local model returns — so the report, history,
// alerts and home remedies work the same whichever engine diagnosed the leaf.
import { z } from "zod";
import type { AiPrediction } from "@/lib/ai";

export type OnlineProvider = "GEMINI" | "GROQ";

export const PROVIDER_INFO: Record<OnlineProvider, { name: string; defaultModel: string; keyUrl: string; keyHint: string }> = {
  GEMINI: {
    name: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "Starts with AIza…",
  },
  GROQ: {
    name: "Groq",
    defaultModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    keyUrl: "https://console.groq.com/keys",
    keyHint: "Starts with gsk_…",
  },
};

/**
 * Keys the app's home-remedy plans know (lib/home-remedies): the AI picks the
 * closest one so "Do this today" and the home remedies fit its diagnosis.
 */
export const PLAN_KEYS = [
  "healthy",
  "early_blight",
  "late_blight",
  "septoria_leaf_spot",
  "target_spot",
  "leaf_mold",
  "powdery_mildew",
  "bacterial_spot",
  "spider_mites_two_spotted_spider_mite",
  "tomato_yellow_leaf_curl_virus",
  "tomato_mosaic_virus",
  "other_fungal",
  "other_bacterial",
  "other_viral",
  "other_pest",
  "care_problem",
] as const;

const SYSTEM = `You are an expert plant pathologist helping a home gardener.
You look at ONE photo of a plant leaf and diagnose it. Be honest: if the photo
is not a plant, is blurry, or you can't tell, say so (uncertain: true).
"care_problem" means not a disease: over/under-watering, sunburn, nutrient
deficiency, cold, root problems, natural ageing.
Answer ONLY with JSON, no markdown, in exactly this shape:
{
  "isPlant": boolean,
  "plantSeen": string,            // what plant this looks like, e.g. "Tomato", "Aloe vera"
  "healthy": boolean,
  "disease": string,              // short name, e.g. "Early blight", "Healthy", "Overwatering"
  "planKey": one of ${JSON.stringify(PLAN_KEYS)},
  "confidence": number,           // 0..1, your honest certainty
  "severity": "low" | "medium" | "high",
  "summary": string,              // 1-2 plain sentences for a beginner
  "symptoms": string[],           // 2-4 short things to look for
  "treatment": {
    "immediate": string[],        // 2-4 steps for today
    "organic": string[],          // 0-3 organic products / home options
    "chemical": string[],         // 0-2 chemical products (common names), only if needed
    "prevention": string[]        // 2-4 tips
  },
  "alternatives": [{ "disease": string, "confidence": number }],  // 0-3 other possibilities
  "uncertain": boolean
}`;

function userPrompt(plantName: string | null) {
  return plantName
    ? `This leaf is from the gardener's pot, which they say grows: ${plantName}. If the photo clearly shows a different plant, say so in "plantSeen". Diagnose the leaf.`
    : "Diagnose this leaf.";
}

const resultSchema = z.object({
  isPlant: z.boolean().catch(true),
  plantSeen: z.string().catch(""),
  healthy: z.boolean().catch(false),
  disease: z.string().min(1).catch("Unknown problem"),
  planKey: z.string().catch("other_fungal"),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  severity: z.enum(["low", "medium", "high"]).catch("medium"),
  summary: z.string().catch(""),
  symptoms: z.array(z.string()).catch([]),
  treatment: z
    .object({
      immediate: z.array(z.string()).catch([]),
      organic: z.array(z.string()).catch([]),
      chemical: z.array(z.string()).catch([]),
      prevention: z.array(z.string()).catch([]),
    })
    .catch({ immediate: [], organic: [], chemical: [], prevention: [] }),
  alternatives: z.array(z.object({ disease: z.string(), confidence: z.coerce.number().min(0).max(1).catch(0.1) })).catch([]),
  uncertain: z.boolean().catch(false),
});

/** The JSON object in a model reply (tolerates ```json fences or text around it). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI didn't return a diagnosis.");
  return JSON.parse(body.slice(start, end + 1));
}

/** Map the AI's JSON onto the same shape the local model returns. */
export function toPrediction(raw: unknown, provider: OnlineProvider, model: string, plantName: string | null): AiPrediction & { summary?: string } {
  const r = resultSchema.parse(raw);
  const planKey = (PLAN_KEYS as readonly string[]).includes(r.planKey) ? r.planKey : "other_fungal";
  const healthy = r.healthy || planKey === "healthy";
  const notPlant = !r.isPlant;
  const plantSeen = r.plantSeen.trim();
  const otherPlant =
    !!plantName && !!plantSeen && !plantSeen.toLowerCase().includes(plantName.toLowerCase().split(" ")[0]) &&
    !plantName.toLowerCase().includes(plantSeen.toLowerCase().split(" ")[0]);
  const uncertain = r.uncertain || notPlant || r.confidence < 0.55;
  const disease = notPlant ? "Not a plant leaf" : healthy ? "Healthy" : r.disease;
  const className = healthy ? "healthy" : planKey; // home-remedies plan key
  return {
    disease,
    crop: plantSeen || plantName || "",
    className,
    confidence: Math.round(r.confidence * 10000) / 10000,
    severity: healthy ? "low" : r.severity,
    symptoms: r.symptoms.slice(0, 5),
    treatment: {
      immediate: r.treatment.immediate.slice(0, 5),
      organic: r.treatment.organic.slice(0, 4),
      chemical: r.treatment.chemical.slice(0, 3),
      prevention: r.treatment.prevention.slice(0, 5),
    },
    recommendation: r.summary || [...r.treatment.immediate, ...r.treatment.prevention].join(" "),
    modelVersion: `${provider.toLowerCase()}:${model}`,
    alternatives: r.alternatives
      .filter((a) => a.disease && a.disease.toLowerCase() !== disease.toLowerCase())
      .slice(0, 3)
      .map((a) => ({ disease: a.disease, className: a.disease, confidence: Math.round(a.confidence * 10000) / 10000 })),
    uncertain,
    restrictedTo: null,
    lookedLike: plantSeen ? plantSeen.toLowerCase() : null,
    cropMatch: otherPlant ? 0 : null,
    summary: r.summary,
  };
}

async function readError(res: Response) {
  const body = await res.text().catch(() => "");
  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string };
    const message = typeof json.error === "string" ? json.error : json.error?.message;
    if (message) return message;
  } catch {
    // not JSON
  }
  return body.slice(0, 200) || res.statusText;
}

/** Turns provider errors into something a gardener can act on. */
function friendly(provider: OnlineProvider, status: number, message: string) {
  const name = PROVIDER_INFO[provider].name;
  if (status === 401 || status === 403 || /api key not valid|invalid api key|permission/i.test(message)) {
    return `${name} rejected the API key. Check it in Settings → Disease AI.`;
  }
  if (status === 429 || /quota|rate limit/i.test(message)) return `${name}'s free limit is used up for now. Try again later.`;
  if (status === 404 || /not found|does not exist|decommissioned/i.test(message)) {
    return `${name} doesn't know the model you chose. Pick another model in Settings → Disease AI.`;
  }
  return `${name} error (${status}): ${message}`;
}

async function callGemini(key: string, model: string, parts: unknown[], json: boolean) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: "application/json" } : {}) },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(friendly("GEMINI", res.status, await readError(res)));
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned an empty answer (the photo may have been blocked). Try another photo.");
  return text;
}

async function callGroq(key: string, model: string, content: unknown, json: boolean): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_completion_tokens: 1200,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const message = await readError(res);
    // Some models don't support JSON mode: ask again without it (the prompt still asks for JSON).
    if (json && res.status === 400 && /response_format|json/i.test(message)) return callGroq(key, model, content, false);
    throw new Error(friendly("GROQ", res.status, message));
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Groq returned an empty answer. Try again.");
  return text;
}

/** Diagnose a leaf photo with Gemini or Groq. */
export async function diagnoseOnline(input: {
  provider: OnlineProvider;
  apiKey: string;
  model?: string | null;
  image: Blob;
  plantName: string | null;
}) {
  const model = input.model?.trim() || PROVIDER_INFO[input.provider].defaultModel;
  const mime = input.image.type || "image/jpeg";
  const base64 = Buffer.from(await input.image.arrayBuffer()).toString("base64");
  const prompt = userPrompt(input.plantName);
  const text =
    input.provider === "GEMINI"
      ? await callGemini(input.apiKey, model, [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }], true)
      : await callGroq(
          input.apiKey,
          model,
          [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
          true,
        );
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    throw new Error(`${PROVIDER_INFO[input.provider].name} answered in an unexpected format. Try again.`);
  }
  return toPrediction(raw, input.provider, model, input.plantName);
}

/** Cheap check that the key + model work (text only, no image). */
export async function testOnline(input: { provider: OnlineProvider; apiKey: string; model?: string | null }) {
  const model = input.model?.trim() || PROVIDER_INFO[input.provider].defaultModel;
  const ask = 'Reply with exactly this JSON: {"ok": true}';
  const text =
    input.provider === "GEMINI"
      ? await callGemini(input.apiKey, model, [{ text: ask }], false)
      : await callGroq(input.apiKey, model, ask, false);
  return { model, reply: text.slice(0, 80) };
}
