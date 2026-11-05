import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { getPotAnalytics, resolveAnalyticsDateRange } from "@/lib/pot-analytics";

// Times go into the workbook as real Excel dates in Bangladesh time (UTC+6),
// so they sort/filter as dates and match what the app shows. Computed by hand
// so the result doesn't depend on the server's own time zone.
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const DATE_FORMAT = "yyyy-mm-dd hh:mm:ss";
const toExcelDate = (date: Date) => (date.getTime() + BD_OFFSET_MS) / 86_400_000 + 25569;
const TIME_HEADER = "Time (Bangladesh)";

const RANGE_LABEL: Record<string, string> = { "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days", custom: "Custom" };

function bdText(date: Date) {
  return new Date(date.getTime() + BD_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

/** Sheet from rows; formats the time column as dates and sizes columns to fit. */
function sheet(rows: Record<string, unknown>[], emptyNote: string) {
  if (!rows.length) return XLSX.utils.aoa_to_sheet([[emptyNote]]);
  const ws = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0]);
  const timeCol = headers.indexOf(TIME_HEADER);
  if (timeCol >= 0) {
    for (let r = 1; r <= rows.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: timeCol })];
      if (cell && cell.t === "n") cell.z = DATE_FORMAT;
    }
  }
  ws["!cols"] = headers.map((header, c) => ({
    wch: Math.min(48, Math.max(header.length, ...rows.slice(0, 200).map((row) => (c === timeCol ? 19 : String(row[header] ?? "").length))) + 2),
  }));
  return ws;
}

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
  const data = await getPotAnalytics(userId, gardenId, potId, dateRange.start, dateRange.end);
  if (!data) return NextResponse.json({ error: "Pot not found" }, { status: 404 });
  const extra = await prisma.pot.findUnique({ where: { id: potId }, select: { number: true, plant: { select: { commonName: true } } } });

  const now = new Date();
  const end = dateRange.end && dateRange.end < now ? dateRange.end : now;
  const values = data.soilMoisture.map((r) => r.value);
  const average = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
  const inBand = values.filter((v) => v >= data.pot.moistureOnThreshold && v <= data.pot.moistureOffThreshold).length;

  const workbook = XLSX.utils.book_new();
  const summary: [string, string | number][] = [
    ["Pot", `${data.pot.label}${extra ? ` (#${extra.number})` : ""}`],
    ["Plant", extra?.plant?.commonName ?? "—"],
    ["Garden", data.pot.garden.name],
    ["Period", RANGE_LABEL[range ?? ""] ?? String(range)],
    ["From (Bangladesh time)", bdText(dateRange.start)],
    ["To (Bangladesh time)", bdText(end)],
    ["Watering mode", data.pot.irrigationMode === "AUTO" ? "Automatic" : "Manual"],
    ["Start watering below (%)", data.pot.moistureOnThreshold],
    ["Stop watering at (%)", data.pot.moistureOffThreshold],
    ["Soil readings", values.length],
    ["Average moisture (%)", average ?? "—"],
    ["Lowest moisture (%)", values.length ? Math.min(...values) : "—"],
    ["Highest moisture (%)", values.length ? Math.max(...values) : "—"],
    ["Time in target band (%)", values.length ? Math.round((inBand / values.length) * 100) : "—"],
    ["Irrigation events", data.irrigation.length],
    ["Pump events", data.pumpEvents.length],
    ["Exported at (Bangladesh time)", bdText(now)],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet([["Item", "Value"], ...summary]);
  summarySheet["!cols"] = [{ wch: 30 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      data.soilMoisture.map((r) => ({ [TIME_HEADER]: toExcelDate(r.recordedAt), "Moisture (%)": r.value, Quality: r.quality ?? "", "Device ID": r.deviceId })),
      "No soil readings in this period.",
    ),
    "Soil Moisture",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      data.weather.map((w) => ({
        [TIME_HEADER]: toExcelDate(w.observedAt),
        "Temperature (°C)": w.temperature,
        "Humidity (%)": w.humidity,
        "Precipitation (mm)": w.precipitation,
        "Rain chance (%)": w.rainProbability,
        "Wind (km/h)": w.windSpeed,
        Condition: w.condition,
        "UV index": w.uvIndex,
      })),
      "No weather saved for this garden in this period.",
    ),
    "Weather",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      data.irrigation.map((e) => ({
        [TIME_HEADER]: toExcelDate(e.startedAt),
        Mode: e.mode === "manual" ? "Manual" : "Automatic",
        Action: e.decision === "PUMP_ON" ? "Pump on" : e.decision === "PUMP_OFF" ? "Pump off" : (e.reason ?? ""),
        "Soil moisture (%)": e.soilMoisture,
        "Start below (%)": e.onThreshold,
        "Stop at (%)": e.offThreshold,
        Result: e.outcome ?? e.status,
        Details: e.reason ?? "",
      })),
      "No irrigation activity in this period.",
    ),
    "Irrigation",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheet(
      data.pumpEvents.map((e) => ({
        [TIME_HEADER]: toExcelDate(e.occurredAt),
        From: e.previousState,
        To: e.newState,
        Source: e.source === "MANUAL" ? "Manual" : e.source === "AUTO" ? "Automatic" : e.source,
        Result: e.status,
        "Failure reason": e.failureReason ?? "",
      })),
      "No pump activity in this period.",
    ),
    "Pump",
  );

  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = `${data.pot.label}-${range ?? "export"}`.replace(/[^a-z0-9_-]/gi, "_");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
