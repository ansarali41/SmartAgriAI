import assert from "node:assert/strict";
import test from "node:test";
import { rm } from "node:fs/promises";
import { diseaseImagePath, readDiseaseImage, saveDiseaseImage, validateDiseaseImage } from "./disease-images";

test("stores one validated private image reference", async () => {
  process.env.DISEASE_IMAGE_UPLOAD_DIR = ".data/disease-predictions-test";
  const image = new Blob(["leaf image"], { type: "image/png" });
  const saved = await saveDiseaseImage(image);
  assert.match(saved.imageRef, /^[a-f0-9-]+\.png$/);
  assert.equal(saved.imageMimeType, "image/png");
  assert.match(diseaseImagePath(saved.imageRef), /disease-predictions-test/);
  await rm(".data/disease-predictions-test", { recursive: true, force: true });
});

test("rejects unsupported and oversized upload types", () => {
  assert.throws(() => validateDiseaseImage(new Blob(["x"], { type: "text/plain" })));
  assert.throws(() => validateDiseaseImage(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/jpeg" })));
});

test("uses Supabase Storage when configured, creating the bucket on first upload", async () => {
  const calls: { url: string; method: string }[] = [];
  const realFetch = globalThis.fetch;
  let uploads = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.includes("/storage/v1/object/") && init?.method === "POST") {
      uploads += 1;
      return new Response("{}", { status: uploads === 1 ? 404 : 200 }); // bucket missing first time
    }
    if (url.endsWith("/storage/v1/bucket")) return new Response("{}", { status: 200 });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as typeof fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const saved = await saveDiseaseImage(new Blob(["leaf"], { type: "image/jpeg" }));
    assert.match(saved.imageRef, /^[a-f0-9-]+\.jpg$/);
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url.replace(/[a-f0-9-]{36}/, "<id>")}`),
      [
        "POST https://example.supabase.co/storage/v1/object/disease-images/<id>.jpg",
        "POST https://example.supabase.co/storage/v1/bucket",
        "POST https://example.supabase.co/storage/v1/object/disease-images/<id>.jpg",
      ],
    );
    const bytes = await readDiseaseImage(saved.imageRef);
    assert.deepEqual([...(bytes ?? [])], [1, 2, 3]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});
