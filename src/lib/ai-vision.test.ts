import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseOnline, extractJson, toPrediction } from "./ai-vision";
import { remedyPlanFor } from "./home-remedies";

const answer = {
  isPlant: true,
  plantSeen: "Tomato",
  healthy: false,
  disease: "Early blight",
  planKey: "early_blight",
  confidence: 0.82,
  severity: "medium",
  summary: "A common fungus on older leaves.",
  symptoms: ["Brown rings", "Yellow halo"],
  treatment: { immediate: ["Remove spotted leaves"], organic: ["Neem oil"], chemical: ["Mancozeb"], prevention: ["Water the soil, not leaves"] },
  alternatives: [{ disease: "Septoria leaf spot", confidence: 0.1 }],
  uncertain: false,
};

test("reads JSON even inside a ```json fence with text around it", () => {
  const raw = extractJson('Sure!\n```json\n{"a": 1}\n```\nHope it helps');
  assert.deepEqual(raw, { a: 1 });
  assert.throws(() => extractJson("no json here"));
});

test("maps the AI answer onto the app's prediction (home remedies included)", () => {
  const p = toPrediction(answer, "GEMINI", "gemini-2.5-flash", "Tomato");
  assert.equal(p.disease, "Early blight");
  assert.equal(p.className, "early_blight");
  assert.equal(remedyPlanFor(p.className).kind, "fungal");
  assert.equal(p.modelVersion, "gemini:gemini-2.5-flash");
  assert.equal(p.uncertain, false);
  assert.equal(p.cropMatch, null);
  assert.equal(p.alternatives?.[0].disease, "Septoria leaf spot");
});

test("care problems, other plants, not-a-plant and bad values are handled", () => {
  const care = toPrediction({ ...answer, disease: "Overwatering", planKey: "care_problem" }, "GROQ", "m", "Aloe vera");
  assert.equal(remedyPlanFor(care.className).kind, "care");
  const other = toPrediction(answer, "GROQ", "m", "Peace lily");
  assert.equal(other.cropMatch, 0); // photo is a tomato, pot is a peace lily
  const notPlant = toPrediction({ ...answer, isPlant: false }, "GROQ", "m", "Tomato");
  assert.equal(notPlant.disease, "Not a plant leaf");
  assert.equal(notPlant.uncertain, true);
  const messy = toPrediction({ disease: "Rust", planKey: "made_up", confidence: "0.3", severity: "awful" }, "GROQ", "m", null);
  assert.equal(messy.className, "other_fungal");
  assert.equal(messy.confidence, 0.3);
  assert.equal(messy.severity, "medium");
  assert.equal(messy.uncertain, true);
});

test("Gemini and Groq requests: endpoint, key header, image and errors", async () => {
  const realFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  try {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("generativelanguage")) return reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
      return reply(200, { choices: [{ message: { content: JSON.stringify(answer) } }] });
    }) as typeof fetch;
    const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    const g = await diagnoseOnline({ provider: "GEMINI", apiKey: "AIzaTEST", model: null, image, plantName: "Tomato" });
    assert.equal(g.disease, "Early blight");
    assert.match(calls[0].url, /models\/gemini-2\.5-flash:generateContent$/);
    assert.equal((calls[0].init.headers as Record<string, string>)["x-goog-api-key"], "AIzaTEST");
    const gBody = JSON.parse(String(calls[0].init.body));
    assert.equal(gBody.contents[0].parts[1].inline_data.data, "AQID");
    assert.equal(gBody.generationConfig.responseMimeType, "application/json");

    const q = await diagnoseOnline({ provider: "GROQ", apiKey: "gsk_TEST", model: "meta-llama/llama-4-scout-17b-16e-instruct", image, plantName: "Tomato" });
    assert.equal(q.modelVersion, "groq:meta-llama/llama-4-scout-17b-16e-instruct");
    assert.equal(calls[1].url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal((calls[1].init.headers as Record<string, string>).authorization, "Bearer gsk_TEST");
    const qBody = JSON.parse(String(calls[1].init.body));
    assert.equal(qBody.messages[1].content[1].image_url.url, "data:image/jpeg;base64,AQID");

    globalThis.fetch = (async () => reply(400, { error: { message: "API key not valid. Please pass a valid API key." } })) as typeof fetch;
    await assert.rejects(diagnoseOnline({ provider: "GEMINI", apiKey: "bad", image, plantName: null }), /rejected the API key/);
    globalThis.fetch = (async () => reply(429, { error: { message: "Rate limit reached" } })) as typeof fetch;
    await assert.rejects(diagnoseOnline({ provider: "GROQ", apiKey: "k", image, plantName: null }), /free limit/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
