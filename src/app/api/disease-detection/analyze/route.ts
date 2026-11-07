// Preserves the existing FastAPI /predict integration and records each result
// against the selected Garden -> Pot -> Plant hierarchy.
import { NextResponse } from "next/server";
import type { Severity } from "@prisma/client";
import { requireUser } from "@/lib/api-auth";
import { analyzeLeafImage, healthContributionFromPrediction, type AiPrediction } from "@/lib/ai";
import { modelCropFor } from "@/lib/model-crops";
import { deleteDiseaseImage, saveDiseaseImage, validateDiseaseImage } from "@/lib/disease-images";
import { prisma } from "@/lib/db";
import { formatDiseaseAnalysisNotification } from "@/lib/business-notifications";
import { enqueueTelegramDelivery } from "@/lib/telegram-delivery-enqueue";
import { createAppNotification } from "@/lib/notify";

export const runtime = "nodejs";

function mapSeverity(s: AiPrediction["severity"]): Severity {
  return s === "high" ? "high" : s === "medium" ? "medium" : "low";
}

export async function POST(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const userId = gate;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const gardenId = form.get("gardenId");
    const potId = form.get("potId");
    const submittedPlantId = form.get("plantId");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "An image file is required (field 'file')" }, { status: 400 });
    }
    if (typeof gardenId !== "string" || typeof potId !== "string") {
      return NextResponse.json({ error: "Garden and pot are required" }, { status: 400 });
    }
    try {
      validateDiseaseImage(file);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid image" }, { status: 400 });
    }

    // Derive the plant from the owned pot; never trust a client-provided plant.
    const pot = await prisma.pot.findFirst({
      where: { id: potId, gardenId, userId },
      include: { plant: { select: { id: true, gardenId: true, commonName: true } } },
    });
    if (!pot) return NextResponse.json({ error: "Pot not found for selected garden" }, { status: 404 });
    if (!pot.plant) return NextResponse.json({ error: "Select a pot with an assigned plant" }, { status: 422 });
    const plant = pot.plant;
    if (submittedPlantId && submittedPlantId !== plant.id) {
      return NextResponse.json({ error: "Selected plant does not belong to this pot" }, { status: 400 });
    }

    const garden = await prisma.garden.findFirst({ where: { id: gardenId, userId }, select: { id: true, name: true } });
    if (!garden || plant.gardenId !== gardenId) {
      return NextResponse.json({ error: "Garden not found" }, { status: 404 });
    }

    const filename = file instanceof File && file.name ? file.name : "leaf.jpg";
    let prediction: AiPrediction;
    try {
      // Tell the model the pot's crop (when it knows it) so it only weighs that crop's diseases.
      prediction = await analyzeLeafImage(file, filename, modelCropFor(plant.commonName));
    } catch (error) {
      console.error("AI service call failed:", error);
      return NextResponse.json({ error: "Disease detection service is unavailable" }, { status: 502 });
    }

    // Store one private image after a successful prediction, then reuse its
    // reference in both the legacy report and the new immutable history row.
    const image = await saveDiseaseImage(file);
    try {
      const healthScoreContribution = healthContributionFromPrediction(prediction);
      const { report, history } = await prisma.$transaction(async (tx) => {
        const report = await tx.diseaseReport.create({
          data: {
            userId,
            plantId: plant.id,
            cropName: prediction.crop,
            diseaseName: prediction.disease,
            className: prediction.className,
            confidence: prediction.confidence,
            severity: mapSeverity(prediction.severity),
            symptoms: prediction.symptoms ?? [],
            treatmentImmediate: prediction.treatment?.immediate ?? [],
            treatmentOrganic: prediction.treatment?.organic ?? [],
            treatmentChemical: prediction.treatment?.chemical ?? [],
            treatmentPrevention: prediction.treatment?.prevention ?? [],
            recommendation: prediction.recommendation,
            imageUrls: [image.imageRef],
            healthScoreContribution,
          },
        });
        const history = await tx.diseasePrediction.create({
          data: {
            userId,
            gardenId,
            potId,
            plantId: plant.id,
            imageRef: image.imageRef,
            imageMimeType: image.imageMimeType,
            predictedDisease: prediction.disease,
            className: prediction.className,
            confidence: prediction.confidence,
            details: {
              alternatives: prediction.alternatives ?? [],
              uncertain: prediction.uncertain ?? false,
              restrictedTo: prediction.restrictedTo ?? null,
              lookedLike: prediction.lookedLike ?? null,
              cropMatch: prediction.cropMatch ?? null,
            },
          },
        });
        await tx.plant.update({
          where: { id: plant.id },
          // Unsure about a disease: "at risk" rather than calling it diseased.
          data: {
            healthStatus: prediction.className.toLowerCase().includes("healthy")
              ? "healthy"
              : prediction.uncertain
                ? "at_risk"
                : "diseased",
          },
        });
        await enqueueTelegramDelivery(tx, {
          userId,
          eventKey: `disease-analysis:${history.id}`,
          eventType: "DISEASE_ANALYSIS_COMPLETED",
          eventRef: history.id,
          messageText: formatDiseaseAnalysisNotification({
            gardenName: garden.name,
            potLabel: pot.label,
            predictedDisease: history.predictedDisease,
            confidence: history.confidence,
            occurredAt: history.createdAt,
          }),
        });
        const healthy = prediction.className.toLowerCase().includes("healthy");
        await createAppNotification(tx, {
          userId,
          gardenId,
          potId,
          plantId: plant.id,
          type: healthy ? "info" : "alert",
          severity: healthy ? "low" : "high",
          title: healthy
            ? `${pot.label} looks healthy`
            : prediction.uncertain
              ? `${pot.label}: not sure — maybe ${prediction.disease}`
              : `Possible disease on ${pot.label}: ${prediction.disease}`,
          message: `${garden.name}: ${Math.round(prediction.confidence * 100)}% confidence.${
            prediction.uncertain ? " The AI isn't sure — retake the photo for a better result." : healthy ? "" : " Open the result for treatment steps."
          }`,
          actionUrl: "/disease-detection",
        });
        return { report, history };
      });
      return NextResponse.json({ prediction, report, history }, { status: 201 });
    } catch (error) {
      await deleteDiseaseImage(image.imageRef);
      throw error;
    }
  } catch (error) {
    console.error("Disease analyze error:", error);
    return NextResponse.json({ error: "Failed to analyze image" }, { status: 500 });
  }
}
