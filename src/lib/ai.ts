// Bridge from Next.js API routes to the Python FastAPI disease-detection service.

// Default to 127.0.0.1 (IPv4) rather than "localhost": Node's fetch may resolve
// localhost to IPv6 (::1) while the FastAPI service binds IPv4, which surfaces
// as "Disease detection service is unavailable".
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || "http://127.0.0.1:8001").replace(/\/+$/, "");
// Optional shared secret for a publicly hosted AI service (must match the
// service's AI_SERVICE_TOKEN). /health stays public.
const AI_SERVICE_TOKEN = process.env.AI_SERVICE_TOKEN;
const authHeaders = (): Record<string, string> => (AI_SERVICE_TOKEN ? { "x-ai-token": AI_SERVICE_TOKEN } : {});

export interface AiTreatment {
  immediate: string[];
  organic: string[];
  chemical: string[];
  prevention: string[];
}

export interface AiPrediction {
  disease: string;
  crop: string;
  className: string;
  confidence: number;
  severity: "low" | "medium" | "high";
  symptoms: string[];
  treatment: AiTreatment;
  recommendation: string;
  modelVersion: string;
  /** Next most likely answers (within the pot's crop when known). */
  alternatives?: { disease: string; className: string; confidence: number }[];
  /** The model isn't sure: low confidence, close runner-up, or the photo doesn't look like the crop. */
  uncertain?: boolean;
  /** The crop the answer was limited to (the pot's plant), if any. */
  restrictedTo?: string | null;
  /** The crop the photo looked most like before limiting, e.g. "peach". */
  lookedLike?: string | null;
  /** Share of the model's belief on the pot's crop (0–1); low = doesn't look like it. */
  cropMatch?: number | null;
}

/** The extra detail stored with each scan (reopened from history). */
export type PredictionDetails = Pick<AiPrediction, "alternatives" | "uncertain" | "restrictedTo" | "lookedLike" | "cropMatch">;

export async function analyzeLeafImage(
  file: Blob,
  filename = "leaf.jpg",
  /** The pot's crop as the model names it ("tomato"): only its diseases are considered. */
  crop?: string | null,
): Promise<AiPrediction> {
  const form = new FormData();
  form.append("file", file, filename);
  if (crop) form.append("crop", crop);

  // A free hosted service may be waking from sleep: allow up to a minute.
  const res = await fetch(`${AI_SERVICE_URL}/predict`, {
    method: "POST",
    body: form,
    headers: authHeaders(),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI service error (${res.status}): ${detail}`);
  }

  return (await res.json()) as AiPrediction;
}

export async function aiServiceHealth(): Promise<{
  status: string;
  labels: number;
} | null> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { status: string; labels: number };
  } catch {
    return null;
  }
}

// Map the AI severity + confidence to a 0–100 health-score contribution
// (healthy => 100; worse disease/severity => lower).
export function healthContributionFromPrediction(p: AiPrediction): number {
  const isHealthy =
    p.className.toLowerCase().includes("healthy") ||
    p.disease.toLowerCase().includes("healthy");
  if (isHealthy) return 100;

  const severityFloor = { low: 70, medium: 45, high: 20 }[p.severity] ?? 50;
  // Higher confidence in a disease => stronger penalty toward the floor.
  return Math.round(100 - (100 - severityFloor) * Math.min(p.confidence, 1));
}
