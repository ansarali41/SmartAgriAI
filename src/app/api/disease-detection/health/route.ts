// Which AI will diagnose leaves, and is it ready? The local Python service
// (real model or demo) or an online AI chosen in Settings → Disease AI.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { aiServiceHealth } from "@/lib/ai";
import { getDiseaseEngine } from "@/lib/ai-settings";
import { PROVIDER_INFO } from "@/lib/ai-vision";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const engine = await getDiseaseEngine(gate);
  if (engine.provider !== "LOCAL") {
    // Online AI: ready as long as a key is saved (the local model is the backup).
    return NextResponse.json({
      status: "ready" as const,
      engine: engine.provider.toLowerCase(),
      engineName: PROVIDER_INFO[engine.provider].name,
      model: engine.model,
    });
  }
  const health = await aiServiceHealth();
  if (!health) return NextResponse.json({ status: "offline" as const, engine: "local" });
  return NextResponse.json({
    status: health.status === "ready" ? ("ready" as const) : ("mock" as const),
    engine: "local",
    labels: health.labels,
  });
}
