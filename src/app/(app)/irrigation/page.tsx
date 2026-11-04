"use client";

// PAGE: Smart irrigation — pick a garden, see every pot's moisture at a glance,
// and control one pot: automatic vs manual, pump on/off, watering levels and
// its recent history.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Check,
  ChevronRight,
  Droplets,
  EllipsisVertical,
  ExternalLink,
  Flower2,
  Hand,
  Leaf,
  Loader2,
  Power,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { timeAgo } from "@/components/device-ui";
import { GardenPicker } from "@/components/GardenPicker";
import { useDismiss } from "@/components/HeaderMenus";
import { findPlantProfile } from "@/lib/plant-catalog";
import { apiPatch, apiPost } from "@/lib/api-client";
import { getSelectedGardenId } from "@/lib/selected-garden";

interface Garden {
  id: string;
  name: string;
  location: string | null;
  type: string;
}
interface Pot {
  id: string;
  label: string;
  irrigationMode: "AUTO" | "MANUAL";
  moistureOnThreshold: number;
  moistureOffThreshold: number;
  pumpState: "on" | "off";
  currentMoisture: number | null;
  moistureRecordedAt: string | null;
  plant: { id: string; commonName: string } | null;
  latestCommand: {
    command: "PUMP_ON" | "PUMP_OFF";
    status: "PENDING" | "SENT" | "RETRYING" | "ACKNOWLEDGED" | "FAILED" | "EXPIRED" | "CANCELLED";
    error: string | null;
    deliveryAcknowledgedAt: string | null;
    executionResultAt: string | null;
  } | null;
}
interface LogRow {
  id: string;
  mode: string;
  status: "on" | "off";
  reason: string | null;
  startedAt: string;
}


/** Current time, refreshed periodically so "stale" re-evaluates on its own. */
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Readings arrive every 5 s; older than this means the probe isn't reporting. */
const PROBE_SILENT_MS = 60_000;

function probeSilent(pot: Pot, now: number) {
  return Boolean(pot.moistureRecordedAt && now - new Date(pot.moistureRecordedAt).getTime() > PROBE_SILENT_MS);
}

/** The moisture to show: null when the probe has gone quiet (don't show stale values). */
function liveMoisture(pot: Pot, now: number) {
  return probeSilent(pot, now) ? null : pot.currentMoisture;
}

function moistureState(pot: Pot, now: number) {
  if (probeSilent(pot, now)) return { text: "Probe not reading", tone: "text-rose-600 dark:text-rose-400", bar: "bg-slate-300 dark:bg-slate-600" };
  const m = pot.currentMoisture;
  if (m == null) return { text: "No reading", tone: "text-slate-400", bar: "bg-slate-300 dark:bg-slate-600" };
  if (m < pot.moistureOnThreshold) return { text: "Too dry", tone: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" };
  if (m > pot.moistureOffThreshold) return { text: "Very wet", tone: "text-sky-600 dark:text-sky-400", bar: "bg-sky-500" };
  return { text: "Just right", tone: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" };
}

// ?garden=<id>&pot=<id> (e.g. a pot card's "Watering settings") opens that
// pot directly; reading search params needs a Suspense boundary.
export default function IrrigationPage() {
  return (
    <Suspense fallback={null}>
      <IrrigationContent />
    </Suspense>
  );
}

function IrrigationContent() {
  const searchParams = useSearchParams();
  const { data: gardens } = useSWR<Garden[]>("/api/gardens");
  const [chosenGardenId, setChosenGardenId] = useState<string | null>(() => searchParams.get("garden"));
  const savedGardenId = getSelectedGardenId();
  const gardenId =
    chosenGardenId ??
    (gardens?.some((garden) => garden.id === savedGardenId) ? savedGardenId! : gardens?.[0]?.id ?? "");

  const { data: pots, mutate: mutatePots } = useSWR<Pot[]>(gardenId ? `/api/pots?gardenId=${gardenId}` : null, {
    refreshInterval: 5000,
  });
  const [chosenPotId, setChosenPotId] = useState<string | null>(() => searchParams.get("pot"));
  const listNow = useNow();
  const [potQuery, setPotQuery] = useState("");
  const sortedPots = [...(pots ?? [])].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const selectedPot = sortedPots.find((pot) => pot.id === chosenPotId) ?? sortedPots[0];
  const potNeedle = potQuery.trim().toLowerCase();
  const listedPots = potNeedle
    ? sortedPots.filter((pot) => [pot.label, pot.plant?.commonName ?? ""].some((f) => f.toLowerCase().includes(potNeedle)))
    : sortedPots;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Irrigation" subtitle="Water each pot automatically, or take over by hand when you need to." />

      {/* Garden switcher: searchable, scales to any number of gardens. */}
      {gardens && gardens.length > 0 ? (
        <div className="mb-5">
          <GardenPicker
            gardens={gardens}
            value={gardenId}
            onChange={(id) => {
              setChosenGardenId(id);
              setChosenPotId(null);
              setPotQuery("");
            }}
          />
        </div>
      ) : null}

      {!gardens || (gardenId && !pots) ? (
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
        </div>
      ) : gardens.length === 0 ? (
        <Card className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Create a garden and add pots to manage irrigation.</Card>
      ) : !selectedPot ? (
        <Card className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          This garden has no pots yet. Add one from the garden&apos;s page to start watering.
        </Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          {/* Pot selector (left): a slim list that only chooses which pot to show. */}
          <nav aria-label="Choose a pot" className="lg:sticky lg:top-20">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <p className="text-sm font-bold">Choose a pot</p>
              <p className="text-xs text-slate-400">{sortedPots.length} in this garden</p>
            </div>
            {sortedPots.length > 6 ? (
              <label className="relative mb-2 block">
                <span className="sr-only">Search pots</span>
                <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={potQuery}
                  onChange={(e) => setPotQuery(e.target.value)}
                  placeholder="Search pots or plants…"
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                />
              </label>
            ) : null}
            <ul className="max-h-[calc(100vh-14rem)] space-y-1 overflow-y-auto [scrollbar-width:thin]">
              {listedPots.length === 0 ? <li className="px-3 py-4 text-center text-xs text-slate-400">No pots match.</li> : null}
              {listedPots.map((pot) => {
                const state = moistureState(pot, listNow);
                const shown = liveMoisture(pot, listNow);
                const active = pot.id === selectedPot.id;
                return (
                  <li key={pot.id}>
                    <button
                      type="button"
                      onClick={() => setChosenPotId(pot.id)}
                      aria-current={active ? "true" : undefined}
                      className={`group relative flex w-full items-center gap-3 rounded-lg py-2 pl-4 pr-2.5 text-left transition ${
                        active
                          ? "bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
                          : "hover:bg-slate-100 dark:hover:bg-slate-900/60"
                      }`}
                    >
                      {active ? <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-emerald-500" /> : null}
                      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${state.bar}`} />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className={`block truncate text-sm ${active ? "font-bold" : "font-semibold text-slate-700 dark:text-slate-200"}`}>
                          {pot.label}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {pot.plant?.commonName ?? "No plant"} · <span className={state.tone}>{state.text}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right leading-tight">
                        <span className="block text-sm font-bold tabular-nums">{shown == null ? "--" : `${shown}%`}</span>
                        {pot.pumpState === "on" ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
                            <Droplets size={10} />
                            watering
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight
                        size={15}
                        aria-hidden="true"
                        className={`shrink-0 transition ${active ? "text-emerald-500" : "text-slate-300 group-hover:text-slate-400 dark:text-slate-700"}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Keyed so unsaved slider edits reset when switching pots. */}
          <PotControl
            key={selectedPot.id}
            pot={selectedPot}
            gardenId={gardenId}
            gardenName={gardens.find((garden) => garden.id === gardenId)?.name ?? "Garden"}
            onChange={() => mutatePots()}
          />
        </div>
      )}
    </div>
  );
}

function PotControl({
  pot,
  gardenId,
  gardenName,
  onChange,
}: {
  pot: Pot;
  gardenId: string;
  gardenName: string;
  onChange: () => void;
}) {
  const { data: logs, mutate: mutateLogs } = useSWR<LogRow[]>(`/api/irrigation/logs?gardenId=${gardenId}&potId=${pot.id}`, {
    refreshInterval: 5000,
  });
  const [onDraft, setOnDraft] = useState<number | null>(null);
  const [offDraft, setOffDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const on = onDraft ?? pot.moistureOnThreshold;
  const off = offDraft ?? pot.moistureOffThreshold;
  const dirty = on !== pot.moistureOnThreshold || off !== pot.moistureOffThreshold;
  const valid = on < off;
  const manual = pot.irrigationMode === "MANUAL";
  const pumpOn = pot.pumpState === "on";
  const now = useNow();
  const state = moistureState(pot, now);
  const shown = liveMoisture(pot, now);
  // Readings arrive every 5 s; a minute of silence means the probe isn't
  // giving valid readings even if the board itself is online.
  const stale = Boolean(pot.moistureRecordedAt && now - new Date(pot.moistureRecordedAt).getTime() > 60_000);
  const command = pot.latestCommand;
  const pending = command && ["PENDING", "SENT", "RETRYING"].includes(command.status);
  const recommended = pot.plant ? findPlantProfile(pot.plant.commonName) : undefined;

  async function run(label: string, action: () => Promise<string | undefined>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      const message = await action();
      if (message) setNotice(message);
      onChange();
      mutateLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const setMode = (mode: Pot["irrigationMode"]) =>
    run("mode", async () => {
      const response = await apiPatch<{ autoDecision?: { message: string } }>(`/api/pots/${pot.id}/irrigation`, { irrigationMode: mode });
      return response.autoDecision?.message;
    });

  const saveLevels = () =>
    run("levels", async () => {
      const response = await apiPatch<{ autoDecision?: { message: string } }>(`/api/pots/${pot.id}/irrigation`, {
        moistureOnThreshold: on,
        moistureOffThreshold: off,
      });
      setOnDraft(null);
      setOffDraft(null);
      return response.autoDecision?.message ?? "Watering levels saved.";
    });

  const setPump = (pumpState: "on" | "off") =>
    run(pumpState, async () => {
      const response = await apiPost<{ message: string }>(`/api/pots/${pot.id}/pump`, { pumpState });
      return response.message;
    });

  return (
    <div className="min-w-0 space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Flower2 size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-xs font-medium text-slate-400">
              {gardenName}
              <ChevronRight size={12} aria-hidden="true" />
              <span>Selected pot</span>
            </p>
            <h2 className="truncate text-xl font-black leading-tight">{pot.label}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{pot.plant?.commonName ?? "No plant"}</p>
          </div>
          {/* Mode switch */}
          <div role="radiogroup" aria-label="Watering mode" className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(["AUTO", "MANUAL"] as const).map((mode) => {
              const selected = pot.irrigationMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy !== null}
                  onClick={() => !selected && setMode(mode)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${
                    selected ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {mode === "AUTO" ? <Sparkles size={14} /> : <Hand size={14} />}
                  {mode === "AUTO" ? "Automatic" : "Manual"}
                </button>
              );
            })}
          </div>
          <PotActions
            pot={pot}
            gardenId={gardenId}
            busy={busy !== null}
            recommended={recommended}
            onSetMode={setMode}
            onSetPump={setPump}
            onUseRecommended={() => {
              if (!recommended) return;
              setOnDraft(recommended.moisture[0]);
              setOffDraft(recommended.moisture[1]);
              setNotice(`Recommended levels for ${recommended.name} filled in — press Save levels to apply.`);
            }}
            onRefresh={() => {
              onChange();
              mutateLogs();
            }}
          />
        </header>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          {/* Now */}
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Soil moisture</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-5xl font-black leading-none">
                {shown == null ? <span className="text-slate-300 dark:text-slate-600">--</span> : shown}
                {shown == null ? null : <span className="ml-1 text-xl font-bold text-slate-400">%</span>}
              </p>
              <p className={`text-sm font-bold ${state.tone}`}>{state.text}</p>
            </div>
            <LevelBar value={shown} on={on} off={off} barClass={state.bar} />
            <p className={`mt-2 text-xs ${stale ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
              {pot.moistureRecordedAt
                ? stale
                  ? `Last valid reading ${timeAgo(pot.moistureRecordedAt)} — check the probe wiring. Automatic watering is paused.`
                  : `Updated ${timeAgo(pot.moistureRecordedAt)}`
                : "Waiting for the first sensor reading"}
            </p>
          </div>

          {/* Pump */}
          <div className="flex flex-col rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span
                className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full text-white ${
                  pumpOn ? "bg-sky-500 shadow-lg shadow-sky-500/30" : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                {pumpOn ? <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/40 motion-reduce:hidden" /> : null}
                <Droplets size={22} className="relative" />
              </span>
              <div>
                <p className="text-lg font-black">Pump {pumpOn ? "on" : "off"}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Confirmed by the device</p>
              </div>
            </div>

            {manual ? (
              <button
                type="button"
                onClick={() => setPump(pumpOn ? "off" : "on")}
                disabled={busy !== null || Boolean(pending)}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 ${
                  pumpOn
                    ? "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    : "bg-sky-600 text-white hover:bg-sky-700"
                }`}
              >
                {busy === "on" || busy === "off" ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                {pumpOn ? "Turn pump off" : "Turn pump on"}
              </button>
            ) : (
              <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                <Sparkles size={13} className="mr-1 inline" />
                Runs by itself: on below <b>{pot.moistureOnThreshold}%</b>, off at <b>{pot.moistureOffThreshold}%</b>. Switch to
                Manual to control it by hand.
              </p>
            )}

            {pending ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300">
                <Loader2 size={13} className="animate-spin" />
                Turning {command!.command === "PUMP_ON" ? "on" : "off"} —{" "}
                {command!.deliveryAcknowledgedAt ? "device received it, waiting for result" : command!.status === "RETRYING" ? "retrying" : "sending to device"}
              </p>
            ) : command?.status === "FAILED" ? (
              <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-rose-600">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                Last command failed: {command.error ?? "the device didn't apply it."}
              </p>
            ) : null}
          </div>
        </div>

        {/* Watering levels */}
        <div className="border-t border-slate-100 p-5 dark:border-slate-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">Watering levels</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatic mode keeps soil moisture inside the green band.
              </p>
            </div>
            <button
              type="button"
              onClick={saveLevels}
              disabled={!dirty || !valid || busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "levels" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Save levels
            </button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Slider label="Start watering below" value={on} onChange={setOnDraft} accent="accent-amber-500" />
            <Slider label="Stop watering at" value={off} onChange={setOffDraft} accent="accent-sky-500" />
          </div>
          {!valid ? (
            <p className="mt-2 text-xs font-semibold text-rose-600">“Stop watering at” must be higher than “Start watering below”.</p>
          ) : dirty ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Unsaved changes.</p>
          ) : null}
        </div>
      </section>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-100">{notice}</p> : null}

      {/* History */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-bold">History</h3>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Recent pump activity for {pot.label}.</p>
        {!logs ? (
          <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No watering yet.</p>
        ) : (
          <ol className="relative ml-1.5 space-y-4 border-l border-slate-200 pl-6 dark:border-slate-800">
            {logs.slice(0, 12).map((log) => (
              <li key={log.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    log.status === "on" ? "bg-sky-500" : "bg-slate-400"
                  }`}
                />
                <p className="text-sm font-semibold">
                  Pump turned {log.status}
                  <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {log.mode}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span title={new Date(log.startedAt).toLocaleString()}>{timeAgo(log.startedAt)}</span>
                  {log.reason ? ` · ${log.reason}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function PotActions({
  pot,
  gardenId,
  busy,
  recommended,
  onSetMode,
  onSetPump,
  onUseRecommended,
  onRefresh,
}: {
  pot: Pot;
  gardenId: string;
  busy: boolean;
  recommended: ReturnType<typeof findPlantProfile>;
  onSetMode: (mode: Pot["irrigationMode"]) => void;
  onSetPump: (state: "on" | "off") => void;
  onUseRecommended: () => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);
  const manual = pot.irrigationMode === "MANUAL";
  const pumpOn = pot.pumpState === "on";

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Actions for ${pot.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <EllipsisVertical size={17} />
      </button>
      {open ? (
        <div role="menu" className="animate-fade-in absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
          {manual ? (
            <button role="menuitem" type="button" disabled={busy} onClick={() => run(() => onSetPump(pumpOn ? "off" : "on"))} className={item}>
              <Power size={15} className="text-sky-500" />
              {pumpOn ? "Turn pump off" : "Turn pump on"}
            </button>
          ) : null}
          <button role="menuitem" type="button" disabled={busy} onClick={() => run(() => onSetMode(manual ? "AUTO" : "MANUAL"))} className={item}>
            {manual ? <Sparkles size={15} className="text-slate-400" /> : <Hand size={15} className="text-slate-400" />}
            {manual ? "Switch to automatic" : "Switch to manual control"}
          </button>
          {recommended ? (
            <button role="menuitem" type="button" onClick={() => run(onUseRecommended)} className={item}>
              <Leaf size={15} className="text-emerald-500" />
              <span className="min-w-0">
                <span className="block">Use recommended levels</span>
                <span className="block text-[11px] text-slate-400">
                  {recommended.name}: {recommended.moisture[0]}–{recommended.moisture[1]}%
                </span>
              </span>
            </button>
          ) : null}
          <button role="menuitem" type="button" onClick={() => run(onRefresh)} className={item}>
            <RefreshCw size={15} className="text-slate-400" />
            Refresh reading
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <Link role="menuitem" href={`/gardens/${gardenId}`} onClick={() => setOpen(false)} className={item}>
            <ExternalLink size={15} className="text-slate-400" />
            Open garden details
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function LevelBar({ value, on, off, barClass }: { value: number | null; on: number; off: number; barClass: string }) {
  const low = Math.min(on, off);
  const high = Math.max(on, off);
  return (
    <div className="mt-3">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800" aria-hidden="true">
        <span className="absolute inset-y-0 bg-emerald-500/25 dark:bg-emerald-400/20" style={{ left: `${low}%`, width: `${high - low}%` }} />
        {value != null ? (
          <span className={`absolute inset-y-0 left-0 rounded-full ${barClass}`} style={{ width: `${Math.min(100, Math.max(2, value))}%` }} />
        ) : null}
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-semibold text-slate-400">
        <span className="absolute -translate-x-1/2" style={{ left: `${low}%` }}>
          {low}%
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${high}%` }}>
          {high}%
        </span>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  accent,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  accent: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm font-semibold">
        {label}
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-sm font-black tabular-nums dark:bg-slate-800">{value}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-2 w-full ${accent}`}
      />
    </label>
  );
}
