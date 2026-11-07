// One past diagnosis, with the full report (symptoms, treatment) so it can be
// reopened from history. The report row was written in the same transaction
// as the prediction and shares its stored image reference.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const prediction = await prisma.diseasePrediction.findFirst({
    where: { id, userId: gate },
    select: {
      id: true,
      imageRef: true,
      predictedDisease: true,
      className: true,
      confidence: true,
      details: true,
      createdAt: true,
      plantId: true,
      pot: { select: { id: true, label: true } },
      garden: { select: { id: true, name: true } },
      plant: { select: { id: true, commonName: true } },
    },
  });
  if (!prediction) return NextResponse.json({ error: "Diagnosis not found" }, { status: 404 });

  const report = await prisma.diseaseReport.findFirst({
    where: { userId: gate, plantId: prediction.plantId, imageUrls: { has: prediction.imageRef } },
    select: {
      cropName: true,
      severity: true,
      symptoms: true,
      treatmentImmediate: true,
      treatmentOrganic: true,
      treatmentChemical: true,
      treatmentPrevention: true,
      recommendation: true,
    },
  });

  return NextResponse.json({
    id: prediction.id,
    createdAt: prediction.createdAt,
    imageUrl: `/api/disease-detection/images/${prediction.id}`,
    disease: prediction.predictedDisease,
    className: prediction.className,
    confidence: prediction.confidence,
    crop: report?.cropName ?? null,
    severity: report?.severity ?? "low",
    symptoms: report?.symptoms ?? [],
    treatment: {
      immediate: report?.treatmentImmediate ?? [],
      organic: report?.treatmentOrganic ?? [],
      chemical: report?.treatmentChemical ?? [],
      prevention: report?.treatmentPrevention ?? [],
    },
    recommendation: report?.recommendation ?? null,
    pot: prediction.pot,
    garden: prediction.garden,
    plant: prediction.plant,
    // Alternatives, unsure flag, crop match (scans from before this was stored: null).
    details: prediction.details ?? null,
  });
}
