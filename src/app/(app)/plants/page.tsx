"use client";

// PAGE: Plants across all gardens — health and growth at a glance, growing
// guidance from the plant catalog, and manage each plant from its ⋮ menu.
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CalendarDays, Check, CircleAlert, CircleHelp, Flower2, HeartPulse, Microscope, Package, Pencil, Sun, Trash2 } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { PlantingLauncher } from "@/components/PlantingLauncher";
import { EditPotPanel } from "@/components/GardenSetupPanels";
import { errorMessage, useFeedback } from "@/components/Feedback";
import { CardMenu, EmptyCard, HEALTH_PILL, ShowMore, SkeletonGrid, Tile, Toolbar, selectClass, useNow } from "@/components/ListPage";
import { SOIL_LABELS, findPlantProfile, type SoilType } from "@/lib/plant-catalog";
import { apiDelete } from "@/lib/api-client";

interface Garden {
  id: string;
  name: string;
  location: string | null;
  type: string;
}

interface Plant {
  id: string;
  gardenId: string;
  potId: string;
  commonName: string;
  scientificName: string | null;
  variety: string | null;
  plantedAt: string | null;
  createdAt: string;
  growthStage: string;
  healthStatus: string;
  garden: { name: string };
  pot: {
    id: string;
    label: string;
    soilType: SoilType;
    moistureOnThreshold: number;
    moistureOffThreshold: number;
  };
}

type HealthFilter = "all" | "healthy" | "care" | "unknown";
const STAGES = ["seedling", "vegetative", "flowering", "fruiting", "mature", "harvested"];
const PAGE_SIZE = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

const needsCare = (plant: Plant) => ["diseased", "at_risk", "recovering"].includes(plant.healthStatus);

function healthBucket(plant: Plant): Exclude<HealthFilter, "all"> {
  if (plant.healthStatus === "healthy") return "healthy";
  if (needsCare(plant)) return "care";
  return "unknown";
}

const label = (value: string) => value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function PlantsPage() {
  const { confirm, toast } = useFeedback();
  const { data: gardens } = useSWR<Garden[]>("/api/gardens");
  const { data: plants, mutate } = useSWR<Plant[]>("/api/plants", { refreshInterval: 15000 });
  const now = useNow(60000);
  const [query, setQuery] = useState("");
  const [gardenFilter, setGardenFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<Plant | null>(null);

  const counts = useMemo(() => {
    const list = plants ?? [];
    return {
      total: list.length,
      healthy: list.filter((plant) => healthBucket(plant) === "healthy").length,
      care: list.filter((plant) => healthBucket(plant) === "care").length,
      unknown: list.filter((plant) => healthBucket(plant) === "unknown").length,
    };
  }, [plants]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (plants ?? [])
      .filter((plant) => gardenFilter === "all" || plant.gardenId === gardenFilter)
      .filter((plant) => healthFilter === "all" || healthBucket(plant) === healthFilter)
      .filter((plant) => stageFilter === "all" || plant.growthStage === stageFilter)
      .filter(
        (plant) =>
          !needle ||
          [plant.commonName, plant.variety ?? "", plant.scientificName ?? "", plant.pot.label, plant.garden.name].some((field) =>
            field.toLowerCase().includes(needle),
          ),
      )
      // Plants needing care first, then by name.
      .sort((a, b) => Number(needsCare(b)) - Number(needsCare(a)) || a.commonName.localeCompare(b.commonName));
  }, [plants, gardenFilter, healthFilter, stageFilter, query]);

  const filtersActive = query.trim() !== "" || gardenFilter !== "all" || healthFilter !== "all" || stageFilter !== "all";
  const resetPaging = () => setShown(PAGE_SIZE);
  const toggle = (value: HealthFilter) => {
    setHealthFilter(healthFilter === value ? "all" : value);
    resetPaging();
  };

  async function remove(plant: Plant) {
    const ok = await confirm({
      title: `Delete ${plant.commonName}?`,
      message: `The plant and its disease checks will be removed. ${plant.pot.label} stays, empty — you can add a new plant to it from Edit.`,
      confirmLabel: "Delete plant",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiDelete(`/api/plants/${plant.id}`);
      mutate();
      toast.success(`${plant.commonName} deleted`);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete plant"));
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Plants"
        subtitle="What you're growing, how it's doing, and what it needs."
        action={<PlantingLauncher gardens={gardens ?? []} gardenId={gardenFilter} onCreated={() => mutate()} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Flower2} label="Plants" value={counts.total} active={healthFilter === "all"} onClick={() => toggle("all")} />
        <Tile icon={HeartPulse} label="Healthy" value={counts.healthy} active={healthFilter === "healthy"} onClick={() => toggle("healthy")} />
        <Tile icon={CircleAlert} label="Need care" value={counts.care} tone={counts.care ? "rose" : undefined} active={healthFilter === "care"} onClick={() => toggle("care")} />
        <Tile icon={CircleHelp} label="Health not checked" value={counts.unknown} active={healthFilter === "unknown"} onClick={() => toggle("unknown")} />
      </div>

      <Toolbar
        query={query}
        onQuery={(value) => {
          setQuery(value);
          resetPaging();
        }}
        placeholder="Search by plant, variety, pot or garden…"
        gardens={gardens ?? []}
        gardenFilter={gardenFilter}
        onGarden={(value) => {
          setGardenFilter(value);
          resetPaging();
        }}
        extra={
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              resetPaging();
            }}
            aria-label="Growth stage"
            className={selectClass}
          >
            <option value="all">All stages</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {label(stage)}
              </option>
            ))}
          </select>
        }
        filtersActive={filtersActive}
        onClear={() => {
          setQuery("");
          setGardenFilter("all");
          setHealthFilter("all");
          setStageFilter("all");
        }}
      />

      {!plants ? (
        <SkeletonGrid />
      ) : plants.length === 0 ? (
        <EmptyCard icon={Flower2} title="No plants yet" text="Add a pot with its plant — you'll get soil and watering recommendations for it." />
      ) : filtered.length === 0 ? (
        <Card className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No plants match these filters.</Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, shown).map((plant) => (
              <PlantCard key={plant.id} plant={plant} now={now} onEdit={() => setEditing(plant)} onDelete={() => remove(plant)} />
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
                id: editing.pot.id,
                label: editing.pot.label,
                soilType: editing.pot.soilType,
                moistureOnThreshold: editing.pot.moistureOnThreshold,
                moistureOffThreshold: editing.pot.moistureOffThreshold,
                plant: { id: editing.id, commonName: editing.commonName },
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

function PlantCard({ plant, now, onEdit, onDelete }: { plant: Plant; now: number; onEdit: () => void; onDelete: () => void }) {
  const profile = findPlantProfile(plant.commonName);
  const scientific = plant.scientificName ?? profile?.scientificName;
  const since = plant.plantedAt ?? plant.createdAt;
  const days = Math.max(0, Math.floor((now - new Date(since).getTime()) / DAY_MS));
  const soilOk = profile ? plant.pot.soilType === profile.soil : null;
  const potHref = `/gardens/${plant.gardenId}?tab=pots&pot=${plant.pot.id}`;

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start gap-3 p-4 pb-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Flower2 size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold capitalize leading-tight">
            {plant.commonName}
            {plant.variety ? <span className="font-medium normal-case text-slate-400"> · {plant.variety}</span> : null}
          </p>
          {scientific ? <p className="mt-0.5 truncate text-xs italic text-slate-500 dark:text-slate-400">{scientific}</p> : null}
        </div>
        <CardMenu
          label={plant.commonName}
          items={[
            { icon: Pencil, label: "Edit plant & pot", onSelect: onEdit },
            { icon: Microscope, label: "Check for disease", href: "/disease-detection" },
            { icon: Package, label: `Open ${plant.pot.label}`, href: potHref },
            { icon: Trash2, label: "Delete plant", onSelect: onDelete, danger: true },
          ]}
        />
      </header>

      <div className="flex flex-wrap gap-1.5 px-4">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${HEALTH_PILL[plant.healthStatus] ?? HEALTH_PILL.unknown}`}>
          {plant.healthStatus === "unknown" ? "Health not checked" : label(plant.healthStatus)}
        </span>
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
          {label(plant.growthStage)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <CalendarDays size={11} />
          {days === 0 ? "Planted today" : `${days} ${days === 1 ? "day" : "days"} old`}
        </span>
      </div>

      {profile ? (
        <dl className="mx-4 mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-slate-50 p-3 text-[11px] dark:bg-slate-950/60">
          <div>
            <dt className="font-semibold uppercase tracking-wide text-slate-400">Soil</dt>
            <dd className={`mt-0.5 flex items-center gap-1 font-semibold ${soilOk ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
              {soilOk ? <Check size={12} /> : <CircleAlert size={12} />}
              {soilOk ? SOIL_LABELS[profile.soil] : `Prefers ${SOIL_LABELS[profile.soil].toLowerCase()}`}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-slate-400">Moisture</dt>
            <dd className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">
              {profile.moisture[0]}–{profile.moisture[1]}%
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="sr-only">Sunlight</dt>
            <dd className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <Sun size={12} className="shrink-0 text-amber-500" />
              {profile.sunlight} · {profile.tempC[0]}–{profile.tempC[1]} °C
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mx-4 mt-3 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
          No growing guide for this plant yet.
        </p>
      )}

      <footer className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-[11px] dark:border-slate-800">
        <Link href={potHref} className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-600 hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400">
          <Package size={12} className="shrink-0" />
          <span className="truncate">
            {plant.pot.label} · {plant.garden.name}
          </span>
        </Link>
        <span className="shrink-0 text-slate-400">Live moisture on Pots</span>
      </footer>
    </article>
  );
}
