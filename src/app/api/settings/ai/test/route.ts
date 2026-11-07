// "Test": checks that an online AI's key and model work, with a tiny text-only
// request (no image, so it costs almost nothing of the free quota).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { savedKey } from "@/lib/ai-settings";
import { PROVIDER_INFO, testOnline } from "@/lib/ai-vision";

const schema = z.object({
  provider: z.enum(["GEMINI", "GROQ"]),
  // Test a key before saving it; otherwise the saved key is used.
  apiKey: z.string().trim().max(300).optional(),
  model: z.string().trim().max(100).optional(),
});

export async function POST(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { provider, model } = parsed.data;
  const apiKey = parsed.data.apiKey || (await savedKey(gate, provider));
  if (!apiKey) return NextResponse.json({ error: `Enter your ${PROVIDER_INFO[provider].name} API key first.` }, { status: 400 });
  try {
    const result = await testOnline({ provider, apiKey, model });
    return NextResponse.json({ ok: true, model: result.model });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Test failed" }, { status: 400 });
  }
}
