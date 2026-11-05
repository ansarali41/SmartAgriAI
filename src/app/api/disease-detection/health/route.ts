// Is the Python AI service reachable, and is the real model loaded (vs mock)?
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { aiServiceHealth } from "@/lib/ai";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const health = await aiServiceHealth();
  if (!health) return NextResponse.json({ status: "offline" as const });
  return NextResponse.json({ status: health.status === "ready" ? ("ready" as const) : ("mock" as const), labels: health.labels });
}
