"use client";

// PAGE: Disease AI — pick a pot's plant, add a leaf photo, get a diagnosis
// with first steps and home remedies. Every scan is saved; the history below
// reopens any past report. Uploads are bound to Garden → Pot → Plant.
import { useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Leaf,
  Loader2,
  Microscope,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Sprout,
  TriangleAlert,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PotPicker, type PickerPot } from "@/components/PotPicker";
import { SlideOver } from "@/components/SlideOver";
import { DiagnosisReport, type Diagnosis } from "@/components/DiagnosisReport";
import { useFeedback } from "@/components/Feedback";

interface HistoryItem {
  id: string;
  predictedDisease: string;
  confidence: number;
  createdAt: string;
  imageUrl: string;
  healthy: boolean;
  potId: string;
  pot: { label: string };
  garden: { name: string };
  plant: { commonName: string };
}
interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
  total?: number;
}
type AiStatus = { status: "ready" | "mock" | "offline"; labels?: number };

// Phone photos can be large; they're shrunk in the browser before upload
// (the model only looks at 224×224, and Vercel caps request bodies at 4.5 MB).
const MAX_BYTES = 30 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIDE = 1600;

/** Downscale to MAX_SIDE and re-encode as JPEG. Falls back to the original. */
async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export default function DiseaseDetectionPage() {
  const { toast } = useFeedback();
  const { data: ai, mutate: recheckAi } = useSWR<AiStatus>("/api/disease-detection/health", { refreshInterval: 15000 });
  // Every pot across all gardens; only pots with a plant can be scanned.
  const { data: pots } = useSWR<PickerPot[]>("/api/pots");
  const [chosenPotId, setChosenPotId] = useState("");
  const plantedPots = [...(pots ?? [])].filter((p) => p.plant).sort((a, b) => a.number - b.number);
  const pot = plantedPots.find((p) => p.id === chosenPotId) ?? plantedPots[0];

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultId, setResultId] = useState<string | null>(null);
  const [demoIds, setDemoIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [historyScope, setHistoryScope] = useState<"all" | "pot">("all");

  const history = useSWRInfinite<HistoryPage>((index, previous) => {
    if (previous && !previous.nextCursor) return null;
    const scope = historyScope === "pot" && pot ? `&potId=${pot.id}` : "";
    return `/api/disease-detection/reports?limit=9${scope}${index ? `&cursor=${previous!.nextCursor}` : ""}`;
  });
  const historyItems = history.data?.flatMap((page) => page.items) ?? [];
  const historyTotal = history.data?.[0]?.total ?? 0;
  const hasMore = Boolean(history.data?.[history.data.length - 1]?.nextCursor);

  function pick(next: File | undefined) {
    if (!next) return;
    if (!ACCEPTED.includes(next.type)) {
      toast.error("Use a JPG, PNG or WebP photo.");
      return;
    }
    if (next.size > MAX_BYTES) {
      toast.error("That photo is over 30 MB — try a smaller one.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setError("");
  }

  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
  }

  async function analyze() {
    if (!file || !pot?.plant) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", await shrinkPhoto(file));
      form.append("gardenId", pot.gardenId);
      form.append("potId", pot.id);
      // The server derives and verifies this again from potId.
      form.append("plantId", pot.plant.id);
      const response = await fetch("/api/disease-detection/analyze", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed");
      const id = data.history.id as string;
      if (data.prediction?.modelVersion === "MockModelFallback") setDemoIds((ids) => [...ids, id]);
      setResultId(id);
      clearPhoto();
      history.mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const ready = Boolean(file && pot?.plant && ai?.status !== "offline");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Disease AI"
        subtitle="Photograph a sick leaf — get a diagnosis, first steps and home remedies."
        action={<AiStatusChip ai={ai} />}
      />

      {ai?.status === "offline" ? <StartAiBanner onRetry={() => recheckAi()} /> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* New scan */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <ScanSearch size={18} className="text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-bold">New scan</h2>
          </header>
          <div className="space-y-5 p-5">
            <Step n={1} title="Which pot?">
              {pots && plantedPots.length === 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  No pots with a plant yet. Add a pot & plant first.
                </p>
              ) : pots ? (
                <PotPicker pots={pots} value={pot?.id ?? ""} onChange={(p) => setChosenPotId(p.id)} requirePlant />
              ) : (
                <div className="h-[3.4rem] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              )}
            </Step>

            <Step n={2} title="Add a leaf photo">
              {preview ? (
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Leaf to analyse" className="mx-auto max-h-60 w-full object-contain" />
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-slate-900/70 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-slate-900/90">
                      <RefreshCw size={12} />
                      Change
                      <input type="file" accept={ACCEPTED.join(",")} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
                    </label>
                    <button
                      type="button"
                      onClick={clearPhoto}
                      aria-label="Remove photo"
                      className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900/70 text-white backdrop-blur hover:bg-slate-900/90"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    pick(e.dataTransfer.files?.[0]);
                  }}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                    dragging
                      ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                      : "border-slate-300 hover:border-emerald-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <ImagePlus size={20} />
                  </span>
                  <span className="text-sm font-bold">Take or upload a photo</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Drag it here · JPG, PNG or WebP</span>
                  <input type="file" accept={ACCEPTED.join(",")} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
                </label>
              )}
              <ul className="mt-2.5 grid grid-cols-3 gap-1.5 text-center text-[11px] text-slate-500 dark:text-slate-400">
                <li className="rounded-lg bg-slate-50 px-1.5 py-1.5 dark:bg-slate-800/50">☀️ Daylight, no flash</li>
                <li className="rounded-lg bg-slate-50 px-1.5 py-1.5 dark:bg-slate-800/50">🍃 One leaf fills frame</li>
                <li className="rounded-lg bg-slate-50 px-1.5 py-1.5 dark:bg-slate-800/50">🎯 Spots in focus</li>
              </ul>
            </Step>

            <div>
              <button
                type="button"
                onClick={analyze}
                disabled={!ready || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Microscope size={16} />}
                {loading ? "Checking the leaf…" : "Diagnose leaf"}
              </button>
              {error ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-rose-600">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  {error}
                </p>
              ) : !ready && !loading ? (
                <p className="mt-2 text-center text-xs text-slate-400">
                  {ai?.status === "offline" ? "Start the AI service first (see above)." : !pot ? "Choose a pot first." : "Add a photo to continue."}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Result */}
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <AnalyzingState />
          ) : resultId ? (
            <LoadedReport id={resultId} demo={demoIds.includes(resultId)} />
          ) : (
            <HowItWorks />
          )}
        </section>
      </div>

      {/* History */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-bold">Scan history</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {historyTotal ? `${historyTotal} ${historyTotal === 1 ? "scan" : "scans"} — open any to see the full report again.` : "Every scan is saved here."}
            </p>
          </div>
          <div role="radiogroup" aria-label="Show scans for" className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {(
              [
                ["all", "All plants"],
                ["pot", pot ? `#${pot.number} only` : "This pot"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={historyScope === value}
                disabled={value === "pot" && !pot}
                onClick={() => setHistoryScope(value)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition disabled:opacity-40 ${
                  historyScope === value
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>
        <div className="p-5">
          {!history.data ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-8 text-center">
              <Leaf size={24} className="mx-auto text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm text-slate-400">No scans yet. Your first diagnosis will appear here.</p>
            </div>
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {historyItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(item.id)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-2.5 text-left transition hover:border-emerald-400/70 hover:shadow-sm dark:border-slate-800 dark:hover:border-emerald-500/50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 object-cover dark:bg-slate-800" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {item.healthy ? (
                            <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                          ) : (
                            <TriangleAlert size={13} className="shrink-0 text-rose-500" />
                          )}
                          <span className="truncate text-sm font-bold">{item.predictedDisease}</span>
                        </span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {item.plant.commonName} · {item.pot.label} · {item.garden.name}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          {new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                          {Math.round(item.confidence * 100)}% sure
                        </span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500 dark:text-slate-600" />
                    </button>
                  </li>
                ))}
              </ul>
              {hasMore ? (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => history.setSize(history.size + 1)}
                    disabled={history.isValidating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {history.isValidating ? <Loader2 size={14} className="animate-spin" /> : null}
                    Show older scans
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <SlideOver open={openId !== null} onClose={() => setOpenId(null)} title="Diagnosis report" description="Saved scan — the full report as it was diagnosed.">
        {openId ? <LoadedReport id={openId} demo={demoIds.includes(openId)} inPanel /> : null}
      </SlideOver>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-[11px] font-black text-white">{n}</span>
        {title}
      </p>
      {children}
    </div>
  );
}

function LoadedReport({ id, demo, inPanel = false }: { id: string; demo: boolean; inPanel?: boolean }) {
  const { data, error } = useSWR<Diagnosis>(`/api/disease-detection/reports/${id}`);
  if (error) return <p className="p-6 text-sm text-rose-600">Couldn&apos;t load this report.</p>;
  if (!data) return inPanel ? <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /> : <AnalyzingState label="Loading report…" />;
  return <DiagnosisReport report={data} demo={demo} inPanel={inPanel} />;
}

function AnalyzingState({ label = "Looking closely at the leaf…" }: { label?: string }) {
  return (
    <div className="grid min-h-[26rem] place-items-center p-6 text-center">
      <div>
        <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20 motion-reduce:hidden" />
          <ScanSearch size={28} className="relative" />
        </span>
        <p className="mt-4 font-bold">{label}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">This usually takes a few seconds.</p>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Sprout, title: "Choose the pot", text: "Pick the pot the sick leaf came from." },
    { icon: Camera, title: "Photograph one leaf", text: "Daylight, close up, with the spots in focus." },
    { icon: Sparkles, title: "Get the report", text: "Diagnosis, what to do today, and home remedies you can make." },
  ];
  return (
    <div className="flex min-h-[26rem] flex-col items-center justify-center p-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        <Microscope size={26} />
      </span>
      <h2 className="mt-4 text-lg font-black">Your diagnosis will appear here</h2>
      <ol className="mt-6 grid w-full max-w-xl gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="rounded-xl border border-slate-200 p-3 text-left dark:border-slate-800">
            <step.icon size={18} className="text-emerald-600 dark:text-emerald-400" />
            <p className="mt-2 text-sm font-bold">
              {i + 1}. {step.title}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{step.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AiStatusChip({ ai }: { ai: AiStatus | undefined }) {
  if (!ai) return null;
  const [label, tone, dot] =
    ai.status === "ready"
      ? ["AI model ready", "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300", "bg-emerald-500"]
      : ai.status === "mock"
        ? ["AI in demo mode", "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300", "bg-amber-500"]
        : ["AI service offline", "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300", "bg-rose-500"];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${tone}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function StartAiBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
      <p className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-200">
        <TriangleAlert size={16} />
        The AI service isn&apos;t running
      </p>
      <p className="mt-1 text-sm text-rose-800/80 dark:text-rose-200/80">Start it in a second terminal from the project folder, then press Check again:</p>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs text-emerald-300">
        cd services/ai && .venv/bin/uvicorn app.main:app --port 8001
      </pre>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
      >
        <RefreshCw size={12} />
        Check again
      </button>
    </div>
  );
}
