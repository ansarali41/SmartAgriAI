"use client";

// PAGE: Pots across all gardens — search/filter, live moisture and sensor at a
// glance, and manage each pot (edit, watering, delete) from its ⋮ menu.
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CircleAlert, Cpu, Droplets, Flower2, Package, Pencil, Trash2, Trees } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { PlantingLauncher } from "@/components/PlantingLauncher";
import { EditPotPanel } from "@/components/GardenSetupPanels";
import { deviceStatus, timeAgo } from "@/components/device-ui";
import { errorMessage, useFeedback } from "@/components/Feedback";
import { CardMenu, EmptyCard, HEALTH_PILL, ShowMore, SkeletonGrid, Tile, Toolbar, selectClass, useNow } from "@/components/ListPage";
import { SOIL_LABELS, type SoilType } from "@/lib/plant-catalog";
import { apiDelete } from "@/lib/api-client";

interface Garden {
  id: string;
  name: string;
  location: string | null;
  type: string;
}

interface Pot {
  id: string;
  gardenId: string;
  label: string;
  soilType: SoilType;
  irrigationMode: "AUTO" | "MANUAL";
  pumpState: "on" | "off";
  moistureOnThreshold: number;
  moistureOffThreshold: number;
  garden: { name: string };
  plant: { id: string; commonName: string; healthStatus: string; growthStage: string } | null;
  sensors: { id: string; name: string; status: string }[];
  currentMoisture: number | null;
  moistureRecordedAt: string | null;
}

type StatusFilter = "all" | "dry" | "ok" | "wet" | "no-sensor" | "pump-on";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "dry", label: "Needs water" },
  { value: "ok", label: "Just right" },
  { value: "wet", label: "Very wet" },
  { value: "no-sensor", label: "No device" },
  { value: "pump-on", label: "Pump running" },
];
const PAGE_SIZE = 12;
/** Sensors report every 5 s; older than this isn't a live reading. */
const LIVE_MS = 60_000;

function potState(pot: Pot, now: number) {
  if (pot.sensors.length === 0) return { key: "no-sensor" as const, value: null, text: "No device", tone: "text-slate-400", bar: "bg-slate-300" };
  const live = pot.moistureRecordedAt && now - new Date(pot.moistureRecordedAt).getTime() <= LIVE_MS ? pot.currentMoisture : null;
  if (live == null) return { key: "fault" as const, value: null, text: "Probe not reading", tone: "text-rose-600 dark:text-rose-400", bar: "bg-slate-300" };
  if (live < pot.moistureOnThreshold) return { key: "dry" as const, value: live, text: "Needs water", tone: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" };
  if (live > pot.moistureOffThreshold) return { key: "wet" as const, value: live, text: "Very wet", tone: "text-sky-600 dark:text-sky-400", bar: "bg-sky-500" };
  return { key: "ok" as const, value: live, text: "Just right", tone: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" };
}

export default function PotsPage() {
  const { confirm, toast } = useFeedback();
  const { data: gardens } = useSWR<Garden[]>("/api/gardens");
  const { data: pots, mutate } = useSWR<Pot[]>("/api/pots", { refreshInterval: 3000 });
  const now = useNow();
  const [query, setQuery] = useState("");
  const [gardenFilter, setGardenFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<Pot | null>(null);

  const counts = useMemo(() => {
    const list = pots ?? [];
    const keys = list.map((pot) => potState(pot, now).key);
    return {
      total: list.length,
      dry: keys.filter((key) => key === "dry").length,
      noSensor: keys.filter((key) => key === "no-sensor").length,
      pumpsOn: list.filter((pot) => pot.pumpState === "on").length,
    };
  }, [pots, now]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (pots ?? [])
      .filter((pot) => gardenFilter === "all" || pot.gardenId === gardenFilter)
      .filter((pot) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "pump-on") return pot.pumpState === "on";
        return potState(pot, now).key === statusFilter;
      })
      .filter((pot) => !needle || [pot.label, pot.plant?.commonName ?? "", pot.garden.name].some((field) => field.toLowerCase().includes(needle)))
      .sort((a, b) => a.garden.name.localeCompare(b.garden.name) || a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [pots, gardenFilter, statusFilter, query, now]);

  const filtersActive = query.trim() !== "" || gardenFilter !== "all" || statusFilter !== "all";
  const resetPaging = () => setShown(PAGE_SIZE);

  async function remove(pot: Pot) {
    const ok = await confirm({
      title: `Delete ${pot.label}?`,
      message: `${pot.plant ? `The ${pot.plant.commonName} plant, its` : "Its"} readings and watering history will be removed. This can't be undone.`,
      confirmLabel: "Delete pot",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiDelete(`/api/pots/${pot.id}`);
      mutate();
      toast.success(`${pot.label} deleted`);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete pot"));
    }
  }

  const toggle = (value: StatusFilter) => {
    setStatusFilter(statusFilter === value ? "all" : value);
    resetPaging();
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Pots"
        subtitle="Every pot across your gardens — its plant, soil moisture and device."
        action={<PlantingLauncher gardens={gardens ?? []} gardenId={gardenFilter} onCreated={() => mutate()} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Package} label="Pots" value={counts.total} active={statusFilter === "all"} onClick={() => toggle("all")} />
        <Tile icon={CircleAlert} label="Need water" value={counts.dry} tone={counts.dry ? "amber" : undefined} active={statusFilter === "dry"} onClick={() => toggle("dry")} />
        <Tile icon={Cpu} label="Without a device" value={counts.noSensor} active={statusFilter === "no-sensor"} onClick={() => toggle("no-sensor")} />
        <Tile icon={Droplets} label="Pumps running" value={counts.pumpsOn} tone={counts.pumpsOn ? "sky" : undefined} active={statusFilter === "pump-on"} onClick={() => toggle("pump-on")} />
      </div>

      <Toolbar
        query={query}
        onQuery={(value) => {
          setQuery(value);
          resetPaging();
        }}
        placeholder="Search by pot, plant or garden…"
        gardens={gardens ?? []}
        gardenFilter={gardenFilter}
        onGarden={(value) => {
          setGardenFilter(value);
          resetPaging();
        }}
        extra={
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              resetPaging();
            }}
            aria-label="Status"
            className={selectClass}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        }
        filtersActive={filtersActive}
        onClear={() => {
          setQuery("");
          setGardenFilter("all");
          setStatusFilter("all");
        }}
      />

      {!pots ? (
        <SkeletonGrid />
      ) : pots.length === 0 ? (
        <EmptyCard icon={Package} title="No pots yet" text="Add a pot with its plant to start tracking soil moisture and watering." />
      ) : filtered.length === 0 ? (
        <Card className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No pots match these filters.</Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, shown).map((pot) => (
              <PotCard key={pot.id} pot={pot} now={now} onEdit={() => setEditing(pot)} onDelete={() => remove(pot)} />
            ))}
          </div>
          <ShowMore left={filtered.length - shown} onClick={() => setShown((value) => value + PAGE_SIZE)} />
        </>
      )}

      <EditPotPanel
        open={editing !== null}
        onClose={() => setEditing(null)}
        gardenId={editing?.gardenId ?? ""}
        pot={
          editing
            ? {
                id: editing.id,
                label: editing.label,
                soilType: editing.soilType,
                moistureOnThreshold: editing.moistureOnThreshold,
                moistureOffThreshold: editing.moistureOffThreshold,
                plant: editing.plant ? { id: editing.plant.id, commonName: editing.plant.commonName } : null,
              }
            : null
        }
        onSaved={() => {
          mutate();
          toast.success("Changes saved");
        }}
      />
    </div>
  );
}

function PotCard({ pot, now, onEdit, onDelete }: { pot: Pot; now: number; onEdit: () => void; onDelete: () => void }) {
  const state = potState(pot, now);
  const low = pot.moistureOnThreshold;
  const high = Math.max(pot.moistureOffThreshold, low);
  const sensor = pot.sensors[0];
  const health = pot.plant?.healthStatus;
  const potHref = `/gardens/${pot.gardenId}?tab=pots&pot=${pot.id}`;

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start gap-3 p-4 pb-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Flower2 size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={potHref} className="block truncate font-bold leading-tight hover:text-emerald-600 dark:hover:text-emerald-400">
            {pot.label}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {pot.plant ? <span className="font-medium capitalize text-slate-700 dark:text-slate-200">{pot.plant.commonName}</span> : <span className="italic">No plant</span>}
            {health && health !== "unknown" ? (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize ${HEALTH_PILL[health] ?? HEALTH_PILL.unknown}`}>{health.replace("_", " ")}</span>
            ) : null}
          </p>
        </div>
        <CardMenu
          label={pot.label}
          items={[
            { icon: Pencil, label: "Edit pot & plant", onSelect: onEdit },
            { icon: Droplets, label: "Watering settings", href: `/irrigation?garden=${pot.gardenId}&pot=${pot.id}` },
            { icon: Trees, label: `Open ${pot.garden.name}`, href: potHref },
            { icon: Trash2, label: "Delete pot", onSelect: onDelete, danger: true },
          ]}
        />
      </header>

      <div className="px-4">
        <div className="flex items-end justify-between">
          <p className="text-3xl font-black leading-none">
            {state.value == null ? <span className="text-slate-300 dark:text-slate-600">--</span> : state.value}
            {state.value == null ? null : <span className="ml-0.5 text-base font-bold text-slate-400">%</span>}
          </p>
          <p className={`text-xs font-bold ${state.tone}`}>{state.text}</p>
        </div>
        <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
          <span className="absolute inset-y-0 bg-emerald-500/20 dark:bg-emerald-400/15" style={{ left: `${low}%`, width: `${high - low}%` }} />
          {state.value != null ? (
            <span className={`absolute inset-y-0 left-0 rounded-full ${state.bar}`} style={{ width: `${Math.min(100, Math.max(2, state.value))}%` }} />
          ) : null}
        </div>
        <p className="mt-1.5 flex justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span>
            Target {low}–{high}% · {SOIL_LABELS[pot.soilType] ?? pot.soilType}
          </span>
          {pot.moistureRecordedAt && sensor ? <span>{timeAgo(pot.moistureRecordedAt)}</span> : null}
        </p>
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-[11px] dark:border-slate-800">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sensor ? deviceStatus(sensor.status).dot : "bg-slate-300 dark:bg-slate-600"}`} />
          <span className="truncate">{sensor ? sensor.name : "No device"}</span>
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
            pot.pumpState === "on" ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          <Droplets size={11} />
          Pump {pot.pumpState}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {pot.irrigationMode === "AUTO" ? "Auto" : "Manual"}
        </span>
        <span className="ml-auto truncate text-slate-400">{pot.garden.name}</span>
      </footer>
    </article>
  );
}
