// Private storage for leaf photos sent to Disease AI.
//
// - Live (Vercel): Supabase Storage, when SUPABASE_URL and
//   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) are set. The bucket is private and created on
//   first use; images are only served through the authenticated image route.
// - Local: files under DISEASE_IMAGE_UPLOAD_DIR (default .data/…).
//   Vercel's disk is temporary, so this mode is for development only.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function uploadDir() {
  return path.resolve(process.env.DISEASE_IMAGE_UPLOAD_DIR ?? ".data/disease-predictions");
}

function supabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  // Legacy service_role key, or Supabase's newer secret key (sb_secret_…) — both work.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url, key, bucket: process.env.SUPABASE_STORAGE_BUCKET || "disease-images" };
}

export function validateDiseaseImage(file: Blob) {
  if (!(file.type in extensions)) {
    throw new Error("Upload a JPEG, PNG, or WebP image");
  }
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be between 1 byte and 10 MB");
  }
}

function checkRef(imageRef: string) {
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(imageRef)) {
    throw new Error("Invalid disease image reference");
  }
}

export function diseaseImagePath(imageRef: string) {
  checkRef(imageRef);
  return path.join(uploadDir(), imageRef);
}

// ---------- Supabase Storage (REST, no extra dependency) ----------

type Store = NonNullable<ReturnType<typeof supabase>>;

function headers(store: Store, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${store.key}`, apikey: store.key, ...extra };
}

async function ensureBucket(store: Store) {
  const res = await fetch(`${store.url}/storage/v1/bucket`, {
    method: "POST",
    headers: headers(store, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id: store.bucket, name: store.bucket, public: false }),
  });
  // 200 = created; 400/409 = already exists.
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`Couldn't create storage bucket (${res.status})`);
  }
}

async function upload(store: Store, imageRef: string, body: Buffer, contentType: string) {
  return fetch(`${store.url}/storage/v1/object/${store.bucket}/${imageRef}`, {
    method: "POST",
    headers: headers(store, { "Content-Type": contentType, "x-upsert": "false" }),
    body: new Uint8Array(body),
  });
}

// ---------- Public API ----------

export async function saveDiseaseImage(file: Blob) {
  validateDiseaseImage(file);
  const imageRef = `${randomUUID()}.${extensions[file.type]}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const store = supabase();

  if (store) {
    let res = await upload(store, imageRef, bytes, file.type);
    if (!res.ok) {
      // First upload on a new project: the bucket doesn't exist yet.
      await ensureBucket(store);
      res = await upload(store, imageRef, bytes, file.type);
    }
    if (!res.ok) throw new Error(`Couldn't store the image (${res.status})`);
  } else {
    await mkdir(uploadDir(), { recursive: true });
    await writeFile(path.join(uploadDir(), imageRef), bytes);
  }
  return { imageRef, imageMimeType: file.type };
}

/** The stored bytes, or null if the image is missing. */
export async function readDiseaseImage(imageRef: string): Promise<Buffer | null> {
  checkRef(imageRef);
  const store = supabase();
  if (store) {
    const res = await fetch(`${store.url}/storage/v1/object/${store.bucket}/${imageRef}`, { headers: headers(store) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  try {
    return await readFile(diseaseImagePath(imageRef));
  } catch {
    return null;
  }
}

export async function deleteDiseaseImage(imageRef: string) {
  checkRef(imageRef);
  const store = supabase();
  if (store) {
    await fetch(`${store.url}/storage/v1/object/${store.bucket}`, {
      method: "DELETE",
      headers: headers(store, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [imageRef] }),
    }).catch(() => undefined);
    return;
  }
  await rm(diseaseImagePath(imageRef), { force: true });
}
