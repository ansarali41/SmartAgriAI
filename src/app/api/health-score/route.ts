// TASK: Proposal Feature 5 — Crop Health Score (0–100).
// WHAT: Combines the latest environment readings with the most recent disease
//       contribution (computeHealthScore in lib/health-score.ts).
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { computeHealthScore } from "@/lib/health-score";
import { getLatestEnvironment } from "@/server/readings";

export async function GET(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  try {
    const { searchParams } = new URL(req.url);
    const gardenId = searchParams.get("gardenId") || undefined;

    const [env, latestDisease] = await Promise.all([
      getLatestEnvironment(userId, gardenId),
      prisma.diseaseReport.findFirst({
        where: { userId },
        orderBy: { detectedAt: "desc" },
        select: { healthScoreContribution: true },
      }),
    ]);

    if (env.recordedAt === null && !latestDisease) {
      return NextResponse.json({
        healthScore: 0,
        message: "No device data available yet",
        factors: { moisture: 0, temperature: 0, humidity: 0, diseaseScore: 100 },
      });
    }

    const result = computeHealthScore({
      moisture: env.moisture,
      temperature: env.temperature,
      humidity: env.humidity,
      diseaseScore: latestDisease?.healthScoreContribution ?? 100,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Health score error:", error);
    return NextResponse.json(
      { error: "Failed to calculate health score" },
      { status: 500 },
    );
  }
}
