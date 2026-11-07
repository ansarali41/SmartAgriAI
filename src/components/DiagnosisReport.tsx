"use client";

// One diagnosis, written for a home gardener: what it is, how sure the AI is,
// what to do today, home remedies with recipes, then products and prevention.
// Used for a fresh result and when reopening a scan from history.
import {
  AlertOctagon,
  Bug,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  HeartPulse,
  Info,
  Leaf,
  ListChecks,
  ShieldCheck,
  Sprout,
  TriangleAlert,
  Biohazard,
  type LucideIcon,
} from "lucide-react";
import { remedyPlanFor, type DiseaseKind, type HomeRemedy } from "@/lib/home-remedies";
import { ImageLightbox } from "@/components/ImageLightbox";
import { modelCropFor } from "@/lib/model-crops";

export interface Diagnosis {
  id: string;
  createdAt: string;
  imageUrl: string;
  disease: string;
  className: string | null;
  confidence: number;
  crop: string | null;
  severity: string;
  symptoms: string[];
  treatment: { immediate: string[]; organic: string[]; chemical: string[]; prevention: string[] };
  recommendation: string | null;
  pot: { id: string; label: string };
  garden: { id: string; name: string };
  plant: { id: string; commonName: string };
  /** Extra AI detail (null for scans made before it was stored). */
  details?: {
    alternatives?: { disease: string; className: string; confidence: number }[];
    uncertain?: boolean;
    restrictedTo?: string | null;
    lookedLike?: string | null;
    cropMatch?: number | null;
    /** Which AI diagnosed it: "local" model or e.g. "gemini:gemini-2.5-flash". */
    engine?: string | null;
    /** The online AI's own plain-language summary. */
    summary?: string | null;
    /** Set when the online AI failed and the local model answered instead. */
    fallbackReason?: string | null;
  } | null;
}

const KIND: Record<DiseaseKind, { label: string; icon: LucideIcon; tone: string; panel: string }> = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    panel: "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
  },
  fungal: {
    label: "Fungal disease",
    icon: Leaf,
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    panel: "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
  },
  bacterial: {
    label: "Bacterial disease",
    icon: HeartPulse,
    tone: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
    panel: "border-orange-200 bg-orange-50/70 text-orange-900 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100",
  },
  viral: {
    label: "Virus",
    icon: Biohazard,
    tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    panel: "border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100",
  },
  pest: {
    label: "Pest",
    icon: Bug,
    tone: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
    panel: "border-violet-200 bg-violet-50/70 text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100",
  },
  care: {
    label: "Care problem",
    icon: Sprout,
    tone: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    panel: "border-sky-200 bg-sky-50/70 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100",
  },
};

/** "gemini:gemini-2.5-flash" → "Google Gemini (gemini-2.5-flash)"; local model → null. */
function engineLabel(engine: string | null | undefined) {
  if (!engine) return null;
  const [provider, ...rest] = engine.split(":");
  const model = rest.join(":");
  const name = provider === "gemini" ? "Google Gemini" : provider === "groq" ? "Groq" : null;
  return name ? `${name}${model ? ` (${model.split("/").pop()})` : ""}` : null;
}

function confidenceLabel(confidence: number) {
  if (confidence >= 0.85) return { text: "Very sure", bar: "bg-emerald-500" };
  if (confidence >= 0.6) return { text: "Fairly sure", bar: "bg-amber-500" };
  return { text: "Not sure", bar: "bg-rose-500" };
}

export function DiagnosisReport({ report, demo = false, inPanel = false }: { report: Diagnosis; demo?: boolean; inPanel?: boolean }) {
  const plan = remedyPlanFor(report.className ?? report.disease);
  const kind = KIND[plan.kind];
  const percent = Math.round(report.confidence * 100);
  const details = report.details ?? null;
  const online = engineLabel(details?.engine);
  const unsure = details?.uncertain ?? report.confidence < 0.6;
  // The AI's own "unsure" (close runner-up, photo doesn't look like the crop) wins over the %.
  const sure = unsure ? { text: "Not sure", bar: "bg-rose-500" } : confidenceLabel(report.confidence);
  const healthy = plan.kind === "healthy";
  const plantCrop = modelCropFor(report.plant.commonName);
  // What the photo looked like to the model, before it was limited to the pot's crop.
  const seenCrop = details?.lookedLike ?? (report.crop ? (modelCropFor(report.crop) ?? report.crop.toLowerCase()) : null);
  const doesntLookLikeCrop = Boolean(
    plantCrop && seenCrop && seenCrop !== plantCrop && (details?.cropMatch == null || details.cropMatch < 0.35),
  );
  const alternatives = (details?.alternatives ?? []).filter((a) => a.confidence >= 0.05);
  const hasProducts = report.treatment.organic.length > 0 || report.treatment.chemical.length > 0;

  return (
    <article className={inPanel ? "space-y-5" : "space-y-5 p-5"}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <ImageLightbox
          src={report.imageUrl}
          alt={`Leaf diagnosed as ${report.disease}`}
          className="h-40 w-full sm:h-36 sm:w-36"
        />
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${kind.tone}`}>
            <kind.icon size={12} />
            {kind.label}
          </span>
          <h2 className="mt-1.5 text-2xl font-black leading-tight">
            {unsure ? <span className="mr-1.5 align-middle text-xs font-bold uppercase tracking-wide text-rose-500">Best guess</span> : null}
            {report.disease}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {report.plant.commonName} · {report.pot.label} · {report.garden.name}
          </p>
          <p className="text-xs text-slate-400">
            Scanned {new Date(report.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            {seenCrop ? ` · looks like ${seenCrop} leaf` : ""}
          </p>
          {online ? <p className="text-xs text-slate-400">Diagnosed by {online}</p> : null}
          {details?.restrictedTo ? (
            <p className="text-xs text-slate-400">Checked against {details.restrictedTo} diseases only ({report.pot.label} grows {report.plant.commonName})</p>
          ) : null}
          <div className="mt-3 max-w-xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">{sure.text}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">{percent}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
              <div className={`h-full rounded-full ${sure.bar}`} style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {details?.fallbackReason ? (
        <Note tone="amber" icon={Info}>
          Your online AI couldn&apos;t answer ({details.fallbackReason}) — this result is from the local model instead.
        </Note>
      ) : null}
      {demo ? (
        <Note tone="amber" icon={Info}>
          Demo result — the AI model isn&apos;t loaded, so this is a sample diagnosis, not a real one.
        </Note>
      ) : null}
      {online ? (
        details?.cropMatch === 0 && details.lookedLike ? (
          <Note tone="amber" icon={Info}>
            This photo looks like {details.lookedLike}, but {report.pot.label} grows {report.plant.commonName}. Make sure you
            photographed the right plant.
          </Note>
        ) : null
      ) : !plantCrop ? (
        <Note tone="amber" icon={Info}>
          {`The AI was trained on crop leaves (tomato, potato, pepper, corn, grape, citrus and a few more). ${report.plant.commonName} isn't one of them, so treat this result as a rough guide. The home remedies below are safe for most plants.`}
        </Note>
      ) : doesntLookLikeCrop ? (
        <Note tone="amber" icon={Info}>
          This photo doesn&apos;t look much like a {plantCrop} leaf (it looked closer to {seenCrop}), but {report.pot.label} grows{" "}
          {report.plant.commonName} — so the result is a guess. Make sure you photographed the right plant.
        </Note>
      ) : null}
      {unsure ? (
        <Note tone="amber" icon={TriangleAlert}>
          <span className="font-semibold">The AI isn&apos;t sure.</span> For a better result, retake the photo: daylight without
          flash · one leaf filling the frame · a plain background (hold a sheet of paper behind it) · the spots in sharp focus.
          Or compare the symptoms below with your plant.
        </Note>
      ) : null}

      <div className={`rounded-xl border p-4 text-sm ${kind.panel}`}>
        <p className="font-semibold">{details?.summary || plan.summary}</p>
        {report.symptoms.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="text-xs font-semibold opacity-80">Look for:</span>
            {report.symptoms.map((symptom) => (
              <span key={symptom} className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium dark:bg-slate-950/40">
                {symptom}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {alternatives.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-500 dark:text-slate-400">Could also be:</span>
          {alternatives.map((alt) => (
            <span
              key={alt.className}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 font-medium dark:border-slate-700"
            >
              {alt.disease}
              <span className="tabular-nums text-slate-400">{Math.round(alt.confidence * 100)}%</span>
            </span>
          ))}
        </div>
      ) : null}

      {/* Do this first */}
      <Section icon={ListChecks} title={healthy ? "Keep it healthy" : "Do this today"}>
        <ol className="space-y-2">
          {plan.firstSteps.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-black text-white">{i + 1}</span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* Home remedies */}
      <Section icon={Sprout} title={healthy ? "Simple care at home" : "Home remedies"} hint="Made from things you have at home">
        <div className="space-y-2">
          {plan.remedies.map((remedy, i) => (
            <RemedyCard key={remedy.id} remedy={remedy} defaultOpen={i === 0} />
          ))}
        </div>
        {!healthy ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Spray in the evening, never in strong sun. Try any new spray on one leaf first and wait a day.
          </p>
        ) : null}
      </Section>

      {plan.escalate ? (
        <Note tone="rose" icon={AlertOctagon}>
          {plan.escalate}
        </Note>
      ) : null}

      {/* Products */}
      {!healthy && hasProducts ? (
        <details className="group rounded-xl border border-slate-200 dark:border-slate-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
            <FlaskConical size={16} className="text-slate-400" />
            If home care isn&apos;t enough — shop products
            <ChevronDown size={16} className="ml-auto text-slate-400 transition group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
            {report.treatment.organic.length ? <BulletList title="Organic (try first)" items={report.treatment.organic} /> : null}
            {report.treatment.chemical.length ? (
              <BulletList title="Chemical (last resort — follow the label, wear gloves)" items={report.treatment.chemical} />
            ) : null}
          </div>
        </details>
      ) : null}

      {/* Prevention */}
      {report.treatment.prevention.length ? (
        <Section icon={ShieldCheck} title="Stop it coming back">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {report.treatment.prevention.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <p className="border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
        AI diagnosis from a photo — a guide, not a lab test. If the plant keeps getting worse, ask a local nursery or agriculture officer.
      </p>
    </article>
  );
}

function RemedyCard({ remedy, defaultOpen }: { remedy: HomeRemedy; defaultOpen: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {remedy.name}
            {remedy.localName ? <span className="ml-1.5 text-xs font-medium text-slate-400">{remedy.localName}</span> : null}
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{remedy.why}</span>
        </span>
        <ChevronDown size={16} className="mt-0.5 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 border-t border-slate-200/70 px-4 py-3 text-sm dark:border-slate-800 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">You need</p>
          <ul className="space-y-1">
            {remedy.ingredients.map((item) => (
              <li key={item} className="flex gap-1.5 text-xs">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">How to</p>
          <ol className="space-y-1">
            {remedy.steps.map((step, i) => (
              <li key={step} className="flex gap-2 text-xs">
                <span className="font-black text-emerald-600 dark:text-emerald-400">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
            <CalendarClock size={12} />
            {remedy.schedule}
          </p>
          {remedy.caution ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">⚠ {remedy.caution}</p> : null}
        </div>
      </div>
    </details>
  );
}

function Section({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 flex items-baseline gap-2">
        <Icon size={16} className="relative top-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="font-bold">{title}</span>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold text-slate-500 dark:text-slate-400">{title}</p>
      <ul className="ml-4 list-disc space-y-0.5 text-slate-700 dark:text-slate-300">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Note({ tone, icon: Icon, children }: { tone: "amber" | "rose"; icon: LucideIcon; children: React.ReactNode }) {
  const cls =
    tone === "amber"
      ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
      : "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200";
  return (
    <p className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm ${cls}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
