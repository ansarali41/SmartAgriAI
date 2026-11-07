// A user's Disease AI choice: the local model, Google Gemini or Groq. Keys are
// sealed in the database (lib/secret-box) and only opened server-side.
import type { AiProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { PROVIDER_INFO, type OnlineProvider } from "@/lib/ai-vision";

export type DiseaseEngine =
  | { provider: "LOCAL" }
  | { provider: OnlineProvider; apiKey: string; model: string; fallbackToLocal: boolean };

/** What the diagnosis should run on for this user (keys opened). */
export async function getDiseaseEngine(userId: string): Promise<DiseaseEngine> {
  const row = await prisma.aiSettings.findUnique({ where: { userId } });
  if (!row || row.provider === "LOCAL") return { provider: "LOCAL" };
  const sealed = row.provider === "GEMINI" ? row.geminiKeySealed : row.groqKeySealed;
  const apiKey = sealed ? openSecret(sealed) : null;
  // No usable key (e.g. AUTH_SECRET changed): use the local model.
  if (!apiKey) return { provider: "LOCAL" };
  const model = (row.provider === "GEMINI" ? row.geminiModel : row.groqModel) || PROVIDER_INFO[row.provider].defaultModel;
  return { provider: row.provider, apiKey, model, fallbackToLocal: row.fallbackToLocal };
}

const mask = (sealed: string | null) => {
  if (!sealed) return null;
  const key = openSecret(sealed);
  return key ? `••••${key.slice(-4)}` : "saved (can't be read — enter it again)";
};

/** Safe to send to the browser: no keys, only whether one is saved. */
export async function getAiSettingsView(userId: string) {
  const row = await prisma.aiSettings.findUnique({ where: { userId } });
  return {
    provider: (row?.provider ?? "LOCAL") as AiProvider,
    fallbackToLocal: row?.fallbackToLocal ?? true,
    gemini: { key: mask(row?.geminiKeySealed ?? null), model: row?.geminiModel || PROVIDER_INFO.GEMINI.defaultModel },
    groq: { key: mask(row?.groqKeySealed ?? null), model: row?.groqModel || PROVIDER_INFO.GROQ.defaultModel },
  };
}

export function sealKey(key: string) {
  return sealSecret(key.trim());
}

/** The saved key for a provider (for "Test"), or null. */
export async function savedKey(userId: string, provider: OnlineProvider) {
  const row = await prisma.aiSettings.findUnique({ where: { userId } });
  const sealed = provider === "GEMINI" ? row?.geminiKeySealed : row?.groqKeySealed;
  return sealed ? openSecret(sealed) : null;
}
