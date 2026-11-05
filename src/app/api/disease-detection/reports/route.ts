// Prediction history, always scoped to the authenticated user. Optional
// filters: ?plantId= or ?potId=; paged with ?limit=&cursor=<last id>.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function GET(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const params = new URL(req.url).searchParams;
  const plantId = params.get("plantId") || undefined;
  const potId = params.get("potId") || undefined;
  const cursor = params.get("cursor") || undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit")) || DEFAULT_LIMIT));

  if (plantId) {
    const plant = await prisma.plant.findFirst({ where: { id: plantId, userId: gate }, select: { id: true } });
    if (!plant) return NextResponse.json({ error: "Plant not found" }, { status: 404 });
  }

  const rows = await prisma.diseasePrediction.findMany({
    where: { userId: gate, ...(plantId ? { plantId } : {}), ...(potId ? { potId } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      gardenId: true,
      potId: true,
      plantId: true,
      predictedDisease: true,
      className: true,
      confidence: true,
      createdAt: true,
      pot: { select: { label: true } },
      garden: { select: { name: true } },
      plant: { select: { commonName: true } },
    },
  });
  const items = rows.slice(0, limit).map((report) => ({
    ...report,
    healthy: isHealthy(report.className, report.predictedDisease),
    imageUrl: `/api/disease-detection/images/${report.id}`,
  }));
  const nextCursor = rows.length > limit ? items[items.length - 1].id : null;
  const total = cursor ? undefined : await prisma.diseasePrediction.count({ where: { userId: gate, ...(plantId ? { plantId } : {}), ...(potId ? { potId } : {}) } });
  return NextResponse.json({ items, nextCursor, total });
}

function isHealthy(className: string | null, disease: string) {
  return `${className ?? ""} ${disease}`.toLowerCase().includes("healthy");
}
