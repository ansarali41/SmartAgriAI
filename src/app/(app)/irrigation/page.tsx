"use client";

// PAGE: Smart irrigation — pick a garden, then a pot from the strip of pot
// cards, and control it: automatic vs manual, pump on/off, watering levels,
// with its watering history (paged, filterable) alongside.
import { Suspense, useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Droplets,
  EllipsisVertical,
  ExternalLink,
  Flower2,
  Hand,
  History,
  Leaf,
  Loader2,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { timeAgo } from "@/components/device-ui";
import { GardenPicker } from "@/components/GardenPicker";
import { useDismiss } from "@/components/HeaderMenus";
import { useNow } from "@/components/ListPage";
import { findPlantProfile } from "@/lib/plant-catalog";
import { errorMessage, useFeedback } from "@/components/Feedback";
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
  _count?: { deviceMappings: number };
  latestCommand: {
    command: "PUMP_ON" | "PUMP_OFF";
    status:
      | "PENDING"
      | "SENT"
      | "RETRYING"
      | "ACKNOWLEDGED"
      | "FAILED"
      | "EXPIRED"
      | "CANCELLED";
    error: string | null;
    deliveryAcknowledgedAt: string | null;
    executionResultAt: string | null;
  } | null;
}
interface LogRow {
  id: string;
  mode: "automatic" | "manual" | "scheduled";
  status: "on" | "off";
  reason: string | null;
  decision: string | null;
  soilMoisture: number | null;
  onThreshold: number | null;
  offThreshold: number | null;
  startedAt: string;
}
interface LogPage {
  items: LogRow[];
  nextCursor: string | null;
  summary?: {
    waterings: number;
    runSeconds: number;
    lastWateredAt: string | null;
  };
}

/** Readings arrive every 5 s; older than this means the probe isn't reporting. */
const PROBE_SILENT_MS = 60_000;
const HISTORY_PAGE = 15;

function probeSilent(pot: Pot, now: number) {
  return Boolean(
    pot.moistureRecordedAt &&
    now - new Date(pot.moistureRecordedAt).getTime() > PROBE_SILENT_MS,
  );
}

function hasNoSensor(pot: Pot) {
  return pot._count?.deviceMappings === 0;
}

/** The moisture to show: null when there's no sensor or the probe has gone quiet. */
function liveMoisture(pot: Pot, now: number) {
  return hasNoSensor(pot) || probeSilent(pot, now) ? null : pot.currentMoisture;
}

const GREY = {
  tone: "text-slate-400",
  dot: "bg-slate-300 dark:bg-slate-600",
  stroke: "stroke-slate-300 dark:stroke-slate-600",
};

function moistureState(pot: Pot, now: number) {
  if (hasNoSensor(pot)) return { text: "No sensor", ...GREY };
  if (probeSilent(pot, now))
    return {
      ...GREY,
      text: "Probe not reading",
      tone: "text-rose-600 dark:text-rose-400",
    };
  const m = pot.currentMoisture;
  if (m == null) return { text: "No reading yet", ...GREY };
  if (m < pot.moistureOnThreshold)
    return {
      text: "Too dry",
      tone: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
      stroke: "stroke-amber-500",
    };
  if (m > pot.moistureOffThreshold)
    return {
      text: "Very wet",
      tone: "text-sky-600 dark:text-sky-400",
      dot: "bg-sky-500",
      stroke: "stroke-sky-500",
    };
  return {
    text: "Just right",
    tone: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    stroke: "stroke-emerald-500",
  };
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
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
  const [chosenGardenId, setChosenGardenId] = useState<string | null>(() =>
    searchParams.get("garden"),
  );
  const savedGardenId = getSelectedGardenId();
  const gardenId =
    chosenGardenId ??
    (gardens?.some((garden) => garden.id === savedGardenId)
      ? savedGardenId!
      : (gardens?.[0]?.id ?? ""));
  const garden = gardens?.find((g) => g.id === gardenId);

  const { data: pots, mutate: mutatePots } = useSWR<Pot[]>(
    gardenId ? `/api/pots?gardenId=${gardenId}` : null,
    {
      refreshInterval: 5000,
    },
  );
  const [chosenPotId, setChosenPotId] = useState<string | null>(() =>
    searchParams.get("pot"),
  );
  const sortedPots = [...(pots ?? [])].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
  const selectedPot =
    sortedPots.find((pot) => pot.id === chosenPotId) ?? sortedPots[0];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Irrigation"
        subtitle="Water each pot automatically, or take over by hand when you need to."
        action={
          gardens && gardens.length > 0 ? (
            <GardenPicker
              gardens={gardens}
              value={gardenId}
              label=""
              className="w-full sm:w-72"
              onChange={(id) => {
                setChosenGardenId(id);
                setChosenPotId(null);
              }}
            />
          ) : null
        }
      />

      {!gardens || (gardenId && !pots) ? (
        <div className="space-y-5" aria-hidden="true">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 w-52 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900"
              />
            ))}
          </div>
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
        </div>
      ) : gardens.length === 0 ? (
        <Card className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Create a garden and add pots to manage irrigation.
        </Card>
      ) : !selectedPot ? (
        <Card className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          {garden?.name ?? "This garden"} has no pots yet.{" "}
          <Link
            href={`/gardens/${gardenId}?tab=pots`}
            className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Add one
          </Link>{" "}
          to start watering.
        </Card>
      ) : (
        <>
          <PotChooser
            pots={sortedPots}
            selectedId={selectedPot.id}
            onSelect={setChosenPotId}
          />
          {/* Keyed so unsaved slider edits and history filters reset when switching pots. */}
          <PotControl
            key={selectedPot.id}
            pot={selectedPot}
            gardenId={gardenId}
            gardenName={garden?.name ?? "Garden"}
            onChange={() => mutatePots()}
          />
        </>
      )}
    </div>
  );
}

/** Up to this many pots show as a row of cards; more get the compact picker. */
const STRIP_MAX = 6;

type PotFilter = "all" | "dry" | "watering" | "nosensor";

function potMatches(pot: Pot, filter: PotFilter, now: number) {
  if (filter === "dry") {
    const m = liveMoisture(pot, now);
    return m != null && m < pot.moistureOnThreshold;
  }
  if (filter === "watering") return pot.pumpState === "on";
  if (filter === "nosensor") return hasNoSensor(pot) || probeSilent(pot, now);
  return true;
}

/** Few pots: a row of cards. Many pots: a picker with search, filters and ‹ › stepping. */
function PotChooser({
  pots,
  selectedId,
  onSelect,
}: {
  pots: Pot[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const now = useNow();
  const dry = pots.filter((pot) => potMatches(pot, "dry", now)).length;

  return (
    <nav aria-label="Choose a pot" className="mb-5">
      <p className="mb-2 text-sm font-bold">
        Pots <span className="font-medium text-slate-400">· {pots.length}</span>
        {dry ? (
          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            {dry} too dry
          </span>
        ) : null}
      </p>
      {pots.length <= STRIP_MAX ? (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {pots.map((pot) => (
            <li key={pot.id} className="shrink-0">
              <PotCardButton
                pot={pot}
                now={now}
                active={pot.id === selectedId}
                onClick={() => onSelect(pot.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <PotPicker
          pots={pots}
          selectedId={selectedId}
          onSelect={onSelect}
          now={now}
        />
      )}
    </nav>
  );
}

function PotCardButton({
  pot,
  now,
  active,
  onClick,
}: {
  pot: Pot;
  now: number;
  active: boolean;
  onClick: () => void;
}) {
  const state = moistureState(pot, now);
  const shown = liveMoisture(pot, now);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex w-52 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        active
          ? "border-emerald-500/70 bg-emerald-50/60 ring-1 ring-emerald-500/40 dark:bg-emerald-500/10"
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
      }`}
    >
      <PotRowContent pot={pot} state={state} shown={shown} />
    </button>
  );
}

/** Dot · label/plant/state · moisture/pump — shared by cards, picker trigger and rows. */
function PotRowContent({
  pot,
  state,
  shown,
}: {
  pot: Pot;
  state: ReturnType<typeof moistureState>;
  shown: number | null;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.dot}`}
      />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-bold">{pot.label}</span>
        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
          {pot.plant?.commonName ?? "No plant"} ·{" "}
          <span className={state.tone}>{state.text}</span>
        </span>
      </span>
      <span className="shrink-0 text-right leading-tight">
        <span className="block text-sm font-black tabular-nums">
          {shown == null ? "--" : `${shown}%`}
        </span>
        {pot.pumpState === "on" ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
            <Droplets size={10} />
            watering
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-slate-400">
            {pot.irrigationMode === "AUTO" ? "Auto" : "Manual"}
          </span>
        )}
      </span>
    </>
  );
}

function PotPicker({
  pots,
  selectedId,
  onSelect,
  now,
}: {
  pots: Pot[];
  selectedId: string;
  onSelect: (id: string) => void;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  const index = Math.max(
    0,
    pots.findIndex((pot) => pot.id === selectedId),
  );
  const selected = pots[index];
  const step = (delta: number) =>
    onSelect(pots[(index + delta + pots.length) % pots.length].id);
  const arrow =
    "grid h-[3.25rem] w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-100";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={rootRef} className="relative min-w-0 flex-1 sm:max-w-md">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/70 bg-emerald-50/60 px-3 py-2.5 text-left ring-1 ring-emerald-500/40 transition dark:bg-emerald-500/10"
        >
          <PotRowContent
            pot={selected}
            state={moistureState(selected, now)}
            shown={liveMoisture(selected, now)}
          />
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open ? (
          <div className="animate-fade-in absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40 sm:right-auto sm:w-[28rem]">
            <PotSearchList
              pots={pots}
              selectedId={selectedId}
              now={now}
              onChoose={(id) => {
                onSelect(id);
                close();
                document.getElementById(triggerId)?.focus();
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous pot"
          className={arrow}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next pot"
          className={arrow}
        >
          <ChevronRight size={18} />
        </button>
        <span className="px-1 text-xs font-semibold tabular-nums text-slate-400">
          {index + 1} of {pots.length}
        </span>
      </div>
    </div>
  );
}

const POT_FILTERS: { value: PotFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "dry", label: "Too dry" },
  { value: "watering", label: "Watering" },
  { value: "nosensor", label: "No reading" },
];

/** Mounted only while the picker is open, so search and filter reset on close. */
function PotSearchList({
  pots,
  selectedId,
  now,
  onChoose,
}: {
  pots: Pot[];
  selectedId: string;
  now: number;
  onChoose: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PotFilter>("all");
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const needle = query.trim().toLowerCase();
  const shown = pots.filter(
    (pot) =>
      potMatches(pot, filter, now) &&
      (!needle ||
        [pot.label, pot.plant?.commonName ?? ""].some((field) =>
          field.toLowerCase().includes(needle),
        )),
  );
  const optionId = (pot: Pot) => `${listId}-${pot.id}`;

  function move(next: number) {
    const i = Math.max(0, Math.min(next, shown.length - 1));
    setHighlight(i);
    if (shown[i])
      document
        .getElementById(optionId(shown[i]))
        ?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(highlight + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(highlight - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (shown[highlight]) onChoose(shown[highlight].id);
    }
  }

  return (
    <>
      <div className="space-y-2 border-b border-slate-100 p-2 dark:border-slate-800">
        <label className="relative block">
          <span className="sr-only">Search pots</span>
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={`Search ${pots.length} pots or plants…`}
            role="combobox"
            aria-controls={listId}
            aria-expanded="true"
            aria-activedescendant={
              shown[highlight] ? optionId(shown[highlight]) : undefined
            }
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {POT_FILTERS.map((option) => {
            const count = pots.filter((pot) =>
              potMatches(pot, option.value, now),
            ).length;
            const active = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFilter(option.value);
                  setHighlight(0);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                  active
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {option.label}{" "}
                <span className={active ? "opacity-80" : "text-slate-400"}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Pots"
        className="max-h-80 overflow-y-auto p-1 [scrollbar-width:thin]"
      >
        {shown.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-slate-400">
            No pots match.
          </li>
        ) : (
          shown.map((pot, i) => (
            <li
              key={pot.id}
              id={optionId(pot)}
              role="option"
              aria-selected={pot.id === selectedId}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => onChoose(pot.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${
                i === highlight ? "bg-slate-100 dark:bg-slate-800" : ""
              } ${pot.id === selectedId ? "ring-1 ring-inset ring-emerald-500/50" : ""}`}
            >
              <PotRowContent
                pot={pot}
                state={moistureState(pot, now)}
                shown={liveMoisture(pot, now)}
              />
            </li>
          ))
        )}
      </ul>
    </>
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
  const [onDraft, setOnDraft] = useState<number | null>(null);
  const [offDraft, setOffDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [historyMode, setHistoryMode] = useState<HistoryFilter>("all");
  const { toast } = useFeedback();
  const now = useNow(5000);
  const history = usePotHistory(gardenId, pot.id, historyMode, now);

  const on = onDraft ?? pot.moistureOnThreshold;
  const off = offDraft ?? pot.moistureOffThreshold;
  const dirty =
    on !== pot.moistureOnThreshold || off !== pot.moistureOffThreshold;
  const valid = on < off;
  const manual = pot.irrigationMode === "MANUAL";
  const pumpOn = pot.pumpState === "on";
  const state = moistureState(pot, now);
  const shown = liveMoisture(pot, now);
  const stale = probeSilent(pot, now);
  const noSensor = hasNoSensor(pot);
  const command = pot.latestCommand;
  const pending =
    command && ["PENDING", "SENT", "RETRYING"].includes(command.status);
  const recommended = pot.plant
    ? findPlantProfile(pot.plant.commonName)
    : undefined;
  const connectHref = `/gardens/${gardenId}?tab=pots&pot=${pot.id}`;

  async function run(label: string, action: () => Promise<string | undefined>) {
    setBusy(label);
    try {
      const message = await action();
      if (message) toast.success(message);
      onChange();
      history.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Something went wrong."));
    } finally {
      setBusy(null);
    }
  }

  const setMode = (mode: Pot["irrigationMode"]) =>
    run("mode", async () => {
      const response = await apiPatch<{ autoDecision?: { message: string } }>(
        `/api/pots/${pot.id}/irrigation`,
        { irrigationMode: mode },
      );
      return (
        response.autoDecision?.message ??
        (mode === "AUTO"
          ? "Automatic watering is on."
          : "Manual control is on.")
      );
    });

  const saveLevels = () =>
    run("levels", async () => {
      const response = await apiPatch<{ autoDecision?: { message: string } }>(
        `/api/pots/${pot.id}/irrigation`,
        {
          moistureOnThreshold: on,
          moistureOffThreshold: off,
        },
      );
      setOnDraft(null);
      setOffDraft(null);
      return response.autoDecision?.message ?? "Watering levels saved.";
    });

  const setPump = (pumpState: "on" | "off") =>
    run(pumpState, async () => {
      const response = await apiPost<{ message: string }>(
        `/api/pots/${pot.id}/pump`,
        { pumpState },
      );
      return response.message;
    });

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="@container min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Header: which pot, its sensor, and the mode switch */}
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Flower2 size={18} />
          </span>
          <div className="min-w-[10rem] flex-1">
            <h2 className="truncate text-lg font-black leading-tight">
              {pot.label}
            </h2>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              <span className="truncate">
                {pot.plant?.commonName ?? "No plant"} · {gardenName}
              </span>
              <SensorChip noSensor={noSensor} stale={stale} />
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div
              role="radiogroup"
              aria-label="Watering mode"
              className="inline-flex flex-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800 sm:flex-none"
            >
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
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60 sm:flex-none ${
                      selected
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                  >
                    {busy === "mode" && !selected ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : mode === "AUTO" ? (
                      <Sparkles size={14} />
                    ) : (
                      <Hand size={14} />
                    )}
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
                toast.info(
                  `Recommended levels for ${recommended.name} filled in — press Save levels to apply.`,
                );
              }}
              onRefresh={() => {
                onChange();
                history.refresh();
              }}
            />
          </div>
        </header>

        {/* Status: moisture and pump side by side (stacked only when the card is narrow) */}
        <div className="p-4">
          <div className="flex flex-col gap-4 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-950/60 @xl:flex-row @xl:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <MoistureRing
                value={shown}
                on={on}
                off={off}
                strokeClass={state.stroke}
              />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Soil moisture
                </p>
                <p
                  className={`text-base font-black leading-tight ${state.tone}`}
                >
                  {state.text}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Target{" "}
                  <b className="text-slate-700 dark:text-slate-200">
                    {on}–{off}%
                  </b>
                  {!noSensor && pot.moistureRecordedAt && !stale
                    ? ` · ${timeAgo(pot.moistureRecordedAt)}`
                    : ""}
                </p>
                {noSensor ? (
                  <Link
                    href={connectHref}
                    className="mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    <Cpu size={12} />
                    Connect a sensor
                  </Link>
                ) : stale ? (
                  <p className="mt-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    No reading since {timeAgo(pot.moistureRecordedAt!)} — check
                    the probe.
                  </p>
                ) : !pot.moistureRecordedAt ? (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Waiting for the first reading
                  </p>
                ) : null}
              </div>
            </div>

            <div
              aria-hidden="true"
              className="h-px bg-slate-200 dark:bg-slate-800 @xl:h-16 @xl:w-px"
            />

            {/* Pump */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span
                  className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                    pumpOn
                      ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30"
                      : "bg-slate-200/70 text-slate-400 dark:bg-slate-800"
                  }`}
                >
                  {pumpOn ? (
                    <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/40 motion-reduce:hidden" />
                  ) : null}
                  <Droplets size={18} className="relative" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-black leading-tight">
                    {pumpOn ? "Watering now" : "Pump off"}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {history.summary?.lastWateredAt
                      ? `Last watered ${timeAgo(history.summary.lastWateredAt)}`
                      : "Not watered yet"}
                  </p>
                </div>
                {manual ? (
                  <button
                    type="button"
                    onClick={() => setPump(pumpOn ? "off" : "on")}
                    disabled={busy !== null || Boolean(pending)}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition disabled:opacity-50 ${
                      pumpOn
                        ? "border border-slate-300 text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        : "bg-sky-600 text-white hover:bg-sky-700"
                    }`}
                  >
                    {busy === "on" || busy === "off" ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : pumpOn ? (
                      <PowerOff size={15} />
                    ) : (
                      <Power size={15} />
                    )}
                    {pumpOn ? "Turn off" : "Turn on"}
                  </button>
                ) : null}
              </div>

              {manual ? null : noSensor || stale ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <TriangleAlert size={13} className="shrink-0" />
                  <span>
                    Auto paused — no live reading.{" "}
                    <button
                      type="button"
                      onClick={() => setMode("MANUAL")}
                      disabled={busy !== null}
                      className="font-bold underline-offset-2 hover:underline"
                    >
                      Water by hand
                    </button>
                  </span>
                </p>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <Sparkles size={13} className="shrink-0" />
                  <span>
                    Auto: on below <b>{pot.moistureOnThreshold}%</b>, off at{" "}
                    <b>{pot.moistureOffThreshold}%</b>
                  </span>
                </p>
              )}

              {pending ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300">
                  <Loader2 size={13} className="animate-spin" />
                  Turning {command!.command === "PUMP_ON" ? "on" : "off"} —{" "}
                  {command!.deliveryAcknowledgedAt
                    ? "device received it"
                    : command!.status === "RETRYING"
                      ? "retrying"
                      : "sending to device"}
                </p>
              ) : command?.status === "FAILED" ? (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-rose-600">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  Last command failed:{" "}
                  {command.error ?? "the device didn't apply it."}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Watering levels */}
        <div className="border-t border-slate-100 px-4 pb-4 pt-3.5 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-bold">Watering levels</span>
              {recommended ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {" "}
                  · {recommended.name} likes {recommended.moisture[0]}–
                  {recommended.moisture[1]}%
                  {on !== recommended.moisture[0] ||
                  off !== recommended.moisture[1] ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOnDraft(recommended.moisture[0]);
                        setOffDraft(recommended.moisture[1]);
                      }}
                      className="ml-1.5 font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      Use these
                    </button>
                  ) : null}
                </span>
              ) : null}
            </p>
            {dirty ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOnDraft(null);
                    setOffDraft(null);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={saveLevels}
                  disabled={!valid || busy !== null}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === "levels" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  Save
                </button>
              </div>
            ) : null}
          </div>
          <div className="mt-2.5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Slider
              label="Start watering below"
              value={on}
              onChange={setOnDraft}
              accent="accent-amber-500"
            />
            <Slider
              label="Stop watering at"
              value={off}
              onChange={setOffDraft}
              accent="accent-sky-500"
            />
          </div>
          {!valid ? (
            <p className="mt-2 text-xs font-semibold text-rose-600">
              “Stop watering at” must be higher than “Start watering below”.
            </p>
          ) : null}
        </div>
      </section>

      <HistoryPanel
        history={history}
        mode={historyMode}
        onMode={setHistoryMode}
        potLabel={pot.label}
        now={now}
      />
    </div>
  );
}

function SensorChip({
  noSensor,
  stale,
}: {
  noSensor: boolean;
  stale: boolean;
}) {
  const [label, tone] = noSensor
    ? [
        "No sensor",
        "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
      ]
    : stale
      ? [
          "Probe not reading",
          "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
        ]
      : [
          "Sensor live",
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
        ];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}
    >
      <Cpu size={11} />
      {label}
    </span>
  );
}

/** Ring gauge: thick arc = current moisture, thin outer arc = target band. */
function MoistureRing({
  value,
  on,
  off,
  strokeClass,
}: {
  value: number | null;
  on: number;
  off: number;
  strokeClass: string;
}) {
  const low = Math.min(on, off);
  const high = Math.max(on, off);
  const inner = 2 * Math.PI * 50;
  const outer = 2 * Math.PI * 64;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg
        viewBox="0 0 140 140"
        className="h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="70"
          cy="70"
          r="50"
          fill="none"
          strokeWidth="12"
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx="70"
          cy="70"
          r="64"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-emerald-500/50 transition-all duration-500"
          strokeDasharray={`${((high - low) / 100) * outer} ${outer}`}
          strokeDashoffset={(-low / 100) * outer}
        />
        {value != null ? (
          <circle
            cx="70"
            cy="70"
            r="50"
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            className={`${strokeClass} transition-all duration-700`}
            strokeDasharray={`${(Math.min(100, Math.max(1, value)) / 100) * inner} ${inner}`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <p className="font-black leading-none">
          {value == null ? (
            <span className="text-2xl text-slate-300 dark:text-slate-600">
              --
            </span>
          ) : (
            <>
              <span className="text-2xl tabular-nums">{value}</span>
              <span className="text-sm text-slate-400">%</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

// ---------- History ----------

type HistoryFilter = "all" | "automatic" | "manual";

function usePotHistory(
  gardenId: string,
  potId: string,
  mode: HistoryFilter,
  now: number,
) {
  // Local midnight, so "today" means the user's day. Stable all day long.
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const since = midnight.toISOString();
  const base = `/api/irrigation/logs?gardenId=${gardenId}&potId=${potId}&limit=${HISTORY_PAGE}${mode === "all" ? "" : `&mode=${mode}`}`;
  const { data, size, setSize, mutate, isValidating } = useSWRInfinite<LogPage>(
    (index, previous) => {
      if (previous && !previous.nextCursor) return null;
      return index === 0
        ? `${base}&since=${encodeURIComponent(since)}`
        : `${base}&cursor=${previous!.nextCursor}`;
    },
    { refreshInterval: 5000 },
  );
  const items = data?.flatMap((page) => page.items) ?? [];
  const hasMore = Boolean(data?.[data.length - 1]?.nextCursor);
  return {
    items,
    loading: !data,
    loadingMore: isValidating && size > (data?.length ?? 0),
    hasMore,
    summary: data?.[0]?.summary,
    loadMore: () => setSize(size + 1),
    refresh: () => mutate(),
  };
}

type History = ReturnType<typeof usePotHistory>;

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

/** Turns a raw event into something a gardener can read. */
function describe(log: LogRow) {
  const auto = log.mode !== "manual";
  if (log.reason?.startsWith("Irrigation mode set to")) {
    const toManual = log.reason.endsWith("MANUAL");
    return {
      kind: "mode" as const,
      title: toManual ? "Switched to manual" : "Switched to automatic",
      detail: toManual
        ? "You control the pump by hand."
        : "The pump follows the watering levels.",
    };
  }
  if (log.decision === "PUMP_ON" || (!log.decision && log.status === "on")) {
    return {
      kind: "on" as const,
      title: "Watering started",
      detail: !auto
        ? "Turned on by you"
        : log.soilMoisture != null
          ? `Soil was ${log.soilMoisture}%${log.onThreshold != null ? ` — below ${log.onThreshold}%` : ""}`
          : "Soil dropped below the start level",
    };
  }
  return {
    kind: "off" as const,
    title: "Watering stopped",
    detail: !auto
      ? "Turned off by you"
      : log.soilMoisture != null
        ? `Soil reached ${log.soilMoisture}%${log.offThreshold != null ? ` — stop level ${log.offThreshold}%` : ""}`
        : "Soil reached the stop level",
  };
}

function dayLabel(date: Date, now: number) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function HistoryPanel({
  history,
  mode,
  onMode,
  potLabel,
  now,
}: {
  history: History;
  mode: HistoryFilter;
  onMode: (mode: HistoryFilter) => void;
  potLabel: string;
  now: number;
}) {
  const { items, summary } = history;

  // How long each watering ran: from a "started" to the next "stopped" (newer) row.
  const ranFor = new Map<string, number>();
  let stopAt: number | null = null;
  for (const log of items) {
    const kind = describe(log).kind;
    if (kind === "off") stopAt = new Date(log.startedAt).getTime();
    else if (kind === "on") {
      if (stopAt != null)
        ranFor.set(
          log.id,
          Math.round((stopAt - new Date(log.startedAt).getTime()) / 1000),
        );
      stopAt = null;
    }
  }

  const groups: { label: string; logs: LogRow[] }[] = [];
  for (const log of items) {
    const label = dayLabel(new Date(log.startedAt), now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.logs.push(log);
    else groups.push({ label, logs: [log] });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-20">
      <div className="border-b border-slate-100 p-5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <History size={17} className="text-slate-400" />
          <h3 className="font-bold">Watering history</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Every pump start and stop for {potLabel}.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Today
            </p>
            <p className="text-lg font-black leading-tight">
              {summary ? summary.waterings : "–"}
              <span className="ml-1 text-xs font-semibold text-slate-400">
                {summary?.waterings === 1 ? "watering" : "waterings"}
              </span>
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Pump time
            </p>
            <p className="text-lg font-black leading-tight">
              {summary ? formatDuration(summary.runSeconds) : "–"}
            </p>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Filter history"
          className="mt-4 inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
        >
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="radio"
              aria-checked={mode === filter.value}
              onClick={() => onMode(filter.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                mode === filter.value
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[32rem] overflow-y-auto p-5 [scrollbar-width:thin]">
        {history.loading ? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <Droplets
              size={22}
              className="mx-auto text-slate-300 dark:text-slate-600"
            />
            <p className="mt-2 text-sm text-slate-400">
              {mode === "all" ? "No watering yet." : `No ${mode} activity yet.`}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {group.label}
                </p>
                <ol className="space-y-1">
                  {group.logs.map((log) => {
                    const info = describe(log);
                    const seconds = ranFor.get(log.id);
                    const Icon =
                      info.kind === "mode"
                        ? log.reason?.endsWith("MANUAL")
                          ? Hand
                          : Sparkles
                        : info.kind === "on"
                          ? Droplets
                          : PowerOff;
                    return (
                      <li
                        key={log.id}
                        className="flex gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                            info.kind === "on"
                              ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
                              : info.kind === "mode"
                                ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-semibold">
                              {info.title}
                            </span>
                            <time
                              dateTime={log.startedAt}
                              title={new Date(log.startedAt).toLocaleString()}
                              className="shrink-0 text-[11px] tabular-nums text-slate-400"
                            >
                              {new Date(log.startedAt).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                              })}
                            </time>
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {info.detail}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-1.5">
                            <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {log.mode === "manual" ? "Manual" : "Auto"}
                            </span>
                            {seconds != null ? (
                              <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-px text-[10px] font-bold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                                <Clock size={10} />
                                ran {formatDuration(seconds)}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
            {history.hasMore ? (
              <button
                type="button"
                onClick={history.loadMore}
                disabled={history.loadingMore}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {history.loadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                Load older activity
              </button>
            ) : (
              <p className="text-center text-[11px] text-slate-400">
                That&apos;s everything.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- Small pieces ----------

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
        <div
          role="menu"
          className="animate-fade-in absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40"
        >
          {manual ? (
            <button
              role="menuitem"
              type="button"
              disabled={busy}
              onClick={() => run(() => onSetPump(pumpOn ? "off" : "on"))}
              className={item}
            >
              <Power size={15} className="text-sky-500" />
              {pumpOn ? "Turn pump off" : "Turn pump on"}
            </button>
          ) : null}
          <button
            role="menuitem"
            type="button"
            disabled={busy}
            onClick={() => run(() => onSetMode(manual ? "AUTO" : "MANUAL"))}
            className={item}
          >
            {manual ? (
              <Sparkles size={15} className="text-slate-400" />
            ) : (
              <Hand size={15} className="text-slate-400" />
            )}
            {manual ? "Switch to automatic" : "Switch to manual control"}
          </button>
          {recommended ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => run(onUseRecommended)}
              className={item}
            >
              <Leaf size={15} className="text-emerald-500" />
              <span className="min-w-0">
                <span className="block">Use recommended levels</span>
                <span className="block text-[11px] text-slate-400">
                  {recommended.name}: {recommended.moisture[0]}–
                  {recommended.moisture[1]}%
                </span>
              </span>
            </button>
          ) : null}
          <button
            role="menuitem"
            type="button"
            onClick={() => run(onRefresh)}
            className={item}
          >
            <RefreshCw size={15} className="text-slate-400" />
            Refresh reading
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <Link
            role="menuitem"
            href={`/gardens/${gardenId}?tab=pots&pot=${pot.id}`}
            onClick={() => setOpen(false)}
            className={item}
          >
            <ExternalLink size={15} className="text-slate-400" />
            Open in garden
          </Link>
        </div>
      ) : null}
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
      <span className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-black tabular-nums text-slate-900 dark:bg-slate-800 dark:text-white">
          {value}%
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1 w-full ${accent}`}
      />
    </label>
  );
}
