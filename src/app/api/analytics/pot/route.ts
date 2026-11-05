import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { resolveAnalyticsDateRange } from "@/lib/pot-analytics";
import { getPotAnalyticsOverview } from "@/lib/pot-analytics-overview";

export async function GET(req: Request) {
  const userId = await requireUser();
  if (userId instanceof NextResponse) return userId;
  const query = new URL(req.url).searchParams;
  const gardenId = query.get("gardenId");
  const potId = query.get("potId");
  const range = query.get("range");
  if (!gardenId || !potId) return NextResponse.json({ error: "gardenId and potId are required" }, { status: 400 });
  const dateRange = resolveAnalyticsDateRange(range, query.get("from"), query.get("to"));
  if ("error" in dateRange) return NextResponse.json({ error: dateRange.error }, { status: 400 });
  const analytics = await getPotAnalyticsOverview(userId, gardenId, potId, dateRange.start, dateRange.end);
  if (!analytics) return NextResponse.json({ error: "Pot not found" }, { status: 404 });
  return NextResponse.json(analytics);
}
