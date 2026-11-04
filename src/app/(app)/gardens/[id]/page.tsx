"use client";

// PAGE: Garden details — one garden at a glance (health, key numbers,
// weather, location) with tabs for its pots, devices and recent activity.
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR, { type KeyedMutator } from "swr";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock,
  CloudRain,
  Cpu,
  Droplets,
  EllipsisVertical,
  ExternalLink,
  Flower2,
  Loader2,
  LocateFixed,
  MapPin,
  Microscope,
  Package,
  Pencil,
  Plus,
  Sun,
  Trash2,
  TriangleAlert,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui";
import { SlideOver } from "@/components/SlideOver";
import { AddDevicePanel, AddPlantingPanel, EditPotPanel, type EditablePot } from "@/components/GardenSetupPanels";
import { AddDeviceGuide } from "@/components/AddDeviceGuide";
import { useDismiss } from "@/components/HeaderMenus";
import { DEVICE_TYPE_LABELS, deviceStatus, timeAgo } from "@/components/device-ui";
import {
  GardenFields,
  emptyForm,
  gardenToForm,
  gardenType,
  parseGardenForm,
  type Garden,
  type GardenForm,
} from "@/components/GardenForm";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";
import {
  SELECTED_GARDEN_STORAGE_KEY,
  getSelectedGardenId,
  setSelectedGardenId,
} from "@/lib/selected-garden";

// Read-only map preview; Leaflet is client-only.
const GardenMap = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />,
});

interface GardenDetail extends Garden {
  notes: string | null;
}

interface GardenActivity {
  weather: {
    current: { temp: number; humidity: number; rainProb: number; windSpeed: number; description: string };
    forecast: { day: string; high: number; low: number }[];
    isStale: boolean;
    fetchedAt: string;
  } | null;
  weatherUnavailable: boolean;
  devices: { id: string; name: string; type: string; hardwareId: string; status: string; lastSeenAt: string | null }[];
  pots: {
    id: string;
    label: string;
    irrigationMode: string;
    pumpState: string;
    moistureOnThreshold: number;
    moistureOffThreshold: number;
    soilType?: string;
    plant: { id: string; commonName: string; healthStatus: string } | null;
    currentMoisture: number | null;
    moistureRecordedAt: string | null;
    sensors: { id: string; name: string; status: string; lastSeenAt: string | null }[];
  }[];
  pumpHistory: { id: string; potId: string | null; mode: string; status: string; reason: string | null; startedAt: string }[];
  diseaseHistory: { id: string; potId: string; predictedDisease: string; className: string | null; confidence: number; createdAt: string }[];
  alerts: { id: string; severity: string; title: string; message: string }[];
  resolvedAlerts?: number;
  resolvedAlertList?: { id: string; severity: string; title: string; message: string; resolvedAt: string | null }[];
}

type Tab = "overview" | "pots" | "devices" | "activity";

// Active garden lives in localStorage; re-read it when this tab or another
// one changes it.
const SELECTED_EVENT = "smart-agri:selected-garden";
function subscribeSelected(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SELECTED_GARDEN_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SELECTED_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SELECTED_EVENT, listener);
  };
}

const TABS: Tab[] = ["overview", "pots", "devices", "activity"];

// Reading search params means this part renders on the client only, so it
// sits inside Suspense (see Next's useSearchParams prerendering notes).
export default function GardenDetailsPage() {
  return (
    <Suspense fallback={<DetailsLoading />}>
      <GardenDetails />
    </Suspense>
  );
}

function GardenDetails() {
  const { id } = useParams<{ id: string }>();
  // ?tab=pots&pot=<id> deep-links to a pot, e.g. from the Sensors page.
  const searchParams = useSearchParams();
  const linkedTab = searchParams.get("tab") as Tab | null;
  const focusPotId = searchParams.get("pot");
  const router = useRouter();
  const { data: garden, error, mutate } = useSWR<GardenDetail>(id ? `/api/gardens/${id}` : null);
  const { data: activity, mutate: mutateActivity } = useSWR<GardenActivity>(
    id ? `/api/gardens/${id}/dashboard` : null,
    { refreshInterval: 30000 },
  );
  const selectedId = useSyncExternalStore(subscribeSelected, getSelectedGardenId, () => null);
  const [tab, setTab] = useState<Tab>(() =>
    linkedTab && TABS.includes(linkedTab) ? linkedTab : focusPotId ? "pots" : "overview",
  );
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<GardenForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingPlanting, setAddingPlanting] = useState(false);
  // Devices are only added from a pot, and connected to it.
  const [addingDeviceFor, setAddingDeviceFor] = useState<{ id: string; label: string } | null>(null);
  // Real boards are added through the guide (find -> choose pot -> press BOOT);
  // addingDeviceFor is the key-based fallback for the simulator.
  const [guideForPot, setGuideForPot] = useState<{ id: string; label: string } | null>(null);
  const [editingPot, setEditingPot] = useState<EditablePot | null>(null);

  if (error) {
    return (
      <Card className="mx-auto max-w-lg py-10 text-center">
        <p className="font-bold">This garden couldn&apos;t be found.</p>
        <p className="mt-1 text-sm text-slate-500">It may have been deleted.</p>
        <Link href="/gardens" className="mt-4 inline-block text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          Back to gardens
        </Link>
      </Card>
    );
  }
  if (!garden) return <DetailsLoading />;

  const type = gardenType(garden.type);
  const active = selectedId === garden.id;
  const devices = activity?.devices ?? [];
  const pots = activity?.pots ?? [];
  const alerts = activity?.alerts ?? [];
  const online = devices.filter((device) => device.status === "ONLINE").length;
  const pumpsOn = pots.filter((pot) => pot.pumpState === "on").length;
  const hasCoordinates = garden.lat != null && garden.lng != null;
  const potLabel = (potId: string | null) => pots.find((pot) => pot.id === potId)?.label ?? "Garden";

  function activate() {
    setSelectedGardenId(garden!.id);
    window.dispatchEvent(new Event(SELECTED_EVENT));
  }

  function openEdit() {
    setFormError("");
    setForm(gardenToForm(garden!));
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await apiPatch(`/api/gardens/${garden!.id}`, parseGardenForm(form));
      setEditing(false);
      mutate();
      mutateActivity();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function removePot(pot: GardenActivity["pots"][number]) {
    const what = pot.plant ? `${pot.label} and its ${pot.plant.commonName}` : pot.label;
    if (!window.confirm(`Delete ${what}? Its readings and watering history are removed too.`)) return;
    try {
      await apiDelete(`/api/pots/${pot.id}`);
      mutate();
      mutateActivity();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete pot");
    }
  }

  async function remove() {
    const confirmed = window.confirm(
      `Delete "${garden!.name}"? Its ${garden!._count.pots} pots, ${garden!._count.plants} plants and sensor history will be removed.`,
    );
    if (!confirmed) return;
    try {
      await apiDelete(`/api/gardens/${garden!.id}`);
      router.push("/gardens");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete garden");
    }
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "pots", label: "Pots", count: garden._count.pots },
    { key: "devices", label: "Devices", count: garden._count.devices },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/gardens" className="font-medium hover:text-emerald-600 dark:hover:text-emerald-400">
          Gardens
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="truncate font-semibold text-slate-900 dark:text-white" aria-current="page">
          {garden.name}
        </span>
      </nav>

      {/* Header: who / where / actions */}
      <header className="relative rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${type.iconClass}`}>
            <type.icon size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-black">{garden.name}</h1>
              <ActivePill active={active} />
            </div>
            <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              <Meta icon={MapPin} label="Location" value={`${garden.location || "No location"} · ${type.label} garden`} />
              <Meta icon={CalendarDays} label="Created" value={`Created ${formatDate(garden.createdAt)}`} />
              <Meta icon={Clock} label="Last updated" value={`Updated ${formatDateTime(garden.updatedAt)}`} />
              {hasCoordinates ? (
                <Meta
                  icon={LocateFixed}
                  label="Coordinates"
                  value={`${garden.lat!.toFixed(4)}, ${garden.lng!.toFixed(4)}`}
                />
              ) : null}
            </dl>
          </div>
          <div className="absolute right-4 top-4 flex items-center gap-2 sm:static">
            <AttentionMenu
              gardenId={garden.id}
              loading={!activity}
              alerts={alerts}
              resolvedCount={activity?.resolvedAlerts ?? 0}
              onChange={mutateActivity}
            />
            <ActionsMenu
              active={active}
              onActivate={activate}
              onEdit={openEdit}
              onDelete={remove}
              onAddPlanting={() => setAddingPlanting(true)}
            />
          </div>
        </div>
      </header>

      {/* Key numbers (shown on every tab) */}
      <div className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Package} label="Pots" value={garden._count.pots} onClick={() => setTab("pots")} />
        <Stat icon={Flower2} label="Plants" value={garden._count.plants} onClick={() => setTab("pots")} />
        <Stat
          icon={Cpu}
          label="Devices online"
          value={online}
          suffix={`of ${garden._count.devices}`}
          onClick={() => setTab("devices")}
        />
        <Stat
          icon={Droplets}
          label="Pumps running"
          value={pumpsOn}
          suffix={`of ${pots.length}`}
          onClick={() => setTab("pots")}
        />
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Garden sections" className="mb-5 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === item.key
                ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {item.label}
            {item.count != null ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
                  tab === item.key
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-5">

          <div className="grid items-start gap-5 lg:grid-cols-5">
            <Panel title="Location" className="lg:col-span-3">
              {hasCoordinates ? (
                <>
                  <GardenMap lat={garden.lat} lng={garden.lng} className="h-56" />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <MapPin size={14} className="text-emerald-600 dark:text-emerald-400" />
                      {garden.location || "Pinned location"}
                    </span>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${garden.lat}&mlon=${garden.lng}#map=15/${garden.lat}/${garden.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      Open in OpenStreetMap
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={MapPin}
                  title="No location set"
                  text="Add this garden's location to see it on the map and get local weather."
                  action={
                    <button type="button" onClick={openEdit} className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      Set location
                    </button>
                  }
                />
              )}
              {garden.notes ? (
                <p className="mt-4 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                  {garden.notes}
                </p>
              ) : null}
            </Panel>

            <Panel title="Weather" className="lg:col-span-2">
              <WeatherSummary
                activity={activity}
                hasCoordinates={hasCoordinates}
                location={garden.location}
                lat={garden.lat}
                lng={garden.lng}
              />
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === "pots" ? (
        !activity ? (
          <SkeletonGrid />
        ) : pots.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Package}
              title="No pots yet"
              text="Add a pot with its plant to start tracking soil moisture and watering."
              action={
                <AddButton onClick={() => setAddingPlanting(true)} icon={Plus}>
                  Add pot & plant
                </AddButton>
              }
            />
          </Panel>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {pots.map((pot) => (
                <PotCard
                  key={pot.id}
                  pot={pot}
                  highlighted={pot.id === focusPotId}
                  devices={devices}
                  onChange={mutateActivity}
                  onAddDevice={() => setGuideForPot({ id: pot.id, label: pot.label })}
                  onEdit={() =>
                    setEditingPot({
                      id: pot.id,
                      label: pot.label,
                      soilType: (pot.soilType ?? "loam") as EditablePot["soilType"],
                      moistureOnThreshold: pot.moistureOnThreshold,
                      moistureOffThreshold: pot.moistureOffThreshold,
                      plant: pot.plant ? { id: pot.plant.id, commonName: pot.plant.commonName } : null,
                    })
                  }
                  onDelete={() => removePot(pot)}
                  wateringHref={`/irrigation?garden=${garden.id}&pot=${pot.id}`}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <AddButton onClick={() => setAddingPlanting(true)} icon={Plus}>
                Add pot & plant
              </AddButton>
              <SectionLink href="/pots">Manage pots →</SectionLink>
            </div>
          </>
        )
      ) : null}

      {tab === "devices" ? (
        !activity ? (
          <SkeletonGrid />
        ) : devices.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Cpu}
              title="No devices yet"
              text="Devices are added from a pot, so each one is connected to the pot it measures."
              action={
                <button type="button" onClick={() => setTab("pots")} className="text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                  Go to Pots →
                </button>
              }
            />
          </Panel>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  pots={pots.filter((pot) => pot.sensors.some((sensor) => sensor.id === device.id))}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Cpu size={13} className="shrink-0" />
                New devices are added from a pot —{" "}
                <button type="button" onClick={() => setTab("pots")} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                  open Pots
                </button>
              </p>
              <SectionLink href="/sensors">Manage devices →</SectionLink>
            </div>
          </>
        )
      ) : null}

      {tab === "activity" ? (
        <ActivityTimeline activity={activity} potLabel={potLabel} onChange={mutateActivity} gardenId={garden.id} />
      ) : null}

      <AddPlantingPanel
        open={addingPlanting}
        onClose={() => setAddingPlanting(false)}
        gardenId={garden.id}
        gardenName={garden.name}
        existingPotLabels={pots.map((pot) => pot.label)}
        devices={devices}
        onCreated={() => {
          mutate();
          mutateActivity();
          setTab("pots");
        }}
      />
      <AddDeviceGuide
        open={guideForPot !== null}
        onClose={() => setGuideForPot(null)}
        gardens={[{ id: garden.id, name: garden.name }]}
        initialGardenId={garden.id}
        initialPotId={guideForPot?.id}
        onDone={() => {
          mutate();
          mutateActivity();
        }}
        onManual={() => {
          setAddingDeviceFor(guideForPot);
          setGuideForPot(null);
        }}
      />
      <EditPotPanel
        open={editingPot !== null}
        onClose={() => setEditingPot(null)}
        gardenId={garden.id}
        pot={editingPot}
        onSaved={() => {
          mutate();
          mutateActivity();
        }}
      />
      <AddDevicePanel
        open={addingDeviceFor !== null}
        onClose={() => setAddingDeviceFor(null)}
        gardenId={garden.id}
        pot={addingDeviceFor}
        onCreated={() => {
          mutate();
          mutateActivity();
        }}
      />

      <SlideOver
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${garden.name}`}
        description="Coordinates are used for live weather and rain-aware irrigation."
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="garden-edit-form"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <Check size={16} />
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        <form id="garden-edit-form" onSubmit={save} className="space-y-4">
          <GardenFields value={form} onChange={setForm} />
          {formError ? <p className="text-sm font-bold text-rose-600">{formError}</p> : null}
        </form>
      </SlideOver>
    </div>
  );
}

type ActivityKind = "warning" | "watering" | "disease";

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  at: string | null;
  icon: LucideIcon;
  dot: string;
  title: string;
  detail: string;
  open?: { alertId: string };
}

/** "Tomato___Early_blight" -> "Early blight (Tomato)". */
function prettyDisease(label: string) {
  const [crop, condition] = label.includes("___") ? label.split("___") : [null, label];
  const clean = (text: string) => text.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  const name = clean(condition ?? label);
  const pretty = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  return crop ? `${pretty} (${clean(crop)})` : pretty;
}

/** Warnings (open and resolved), watering and disease checks in one timeline. */
function ActivityTimeline({
  activity,
  potLabel,
  onChange,
  gardenId,
}: {
  activity?: GardenActivity;
  potLabel: (potId: string | null) => string;
  onChange: () => void;
  gardenId: string;
}) {
  const [filter, setFilter] = useState<"all" | ActivityKind>("all");
  const [busy, setBusy] = useState<string | null>(null);

  if (!activity) {
    return (
      <Panel title="Activity">
        <SkeletonRows />
      </Panel>
    );
  }

  const severe = (severity: string) => severity === "critical" || severity === "high";
  const open: ActivityItem[] = activity.alerts.map((alert) => ({
    id: `open-${alert.id}`,
    kind: "warning",
    at: null,
    icon: TriangleAlert,
    dot: severe(alert.severity) ? "bg-rose-500" : "bg-amber-500",
    title: alert.title,
    detail: alert.title === "Disease detected" ? prettyDisease(alert.message) : alert.message,
    open: { alertId: alert.id },
  }));
  const history: ActivityItem[] = [
    ...(activity.resolvedAlertList ?? []).map((alert) => ({
      id: `resolved-${alert.id}`,
      kind: "warning" as const,
      at: alert.resolvedAt,
      icon: CircleCheck,
      dot: "bg-emerald-500",
      title: `Resolved: ${alert.title}`,
      detail: alert.title === "Disease detected" ? prettyDisease(alert.message) : alert.message,
    })),
    ...activity.pumpHistory.slice(0, 15).map((event) => ({
      id: event.id,
      kind: "watering" as const,
      at: event.startedAt,
      icon: Droplets,
      dot: event.status === "on" ? "bg-sky-500" : "bg-slate-400",
      title: `${potLabel(event.potId)} · pump turned ${event.status}`,
      detail: [event.mode, event.reason].filter(Boolean).join(" · "),
    })),
    ...activity.diseaseHistory.slice(0, 10).map((prediction) => ({
      id: prediction.id,
      kind: "disease" as const,
      at: prediction.createdAt,
      icon: Microscope,
      dot: "bg-violet-500",
      title: `${potLabel(prediction.potId)} · ${prettyDisease(prediction.className ?? prediction.predictedDisease)}`,
      detail: `Disease AI · ${Math.round(prediction.confidence * 100)}% confidence`,
    })),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const all = [...open, ...history];
  const items = (filter === "all" ? all : all.filter((item) => item.kind === filter)).slice(0, 20);
  const count = (kind: ActivityKind) => all.filter((item) => item.kind === kind).length;
  const chips: { key: "all" | ActivityKind; label: string; count: number }[] = [
    { key: "all", label: "All", count: all.length },
    { key: "warning", label: "Warnings", count: count("warning") },
    { key: "watering", label: "Watering", count: count("watering") },
    { key: "disease", label: "Disease", count: count("disease") },
  ];

  async function resolve(alertId: string) {
    setBusy(alertId);
    try {
      await apiPost(`/api/gardens/${gardenId}/alerts/resolve`, { alertId });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Activity" description="Warnings, watering and disease checks — newest first.">
      <div className="mb-5 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            aria-pressed={filter === chip.key}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
              filter === chip.key
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            {chip.label}
            <span
              className={`rounded-full px-1.5 text-[10px] ${
                filter === chip.key ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"
              }`}
            >
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Nothing here yet"
          text={filter === "warning" ? "No warnings for this garden." : "Watering, disease checks and warnings will appear here."}
        />
      ) : (
        <ol className="relative ml-1.5 space-y-5 border-l border-slate-200 pl-6 dark:border-slate-800">
          {items.map((item) => (
            <li key={item.id} className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-900 ${item.dot}`}
              />
              <div className={item.open ? "rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 dark:border-amber-500/25 dark:bg-amber-500/5" : ""}>
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  <item.icon size={14} className={item.open ? "text-amber-600 dark:text-amber-400" : "text-slate-400"} />
                  {item.title}
                  {item.open ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                      Needs attention
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {item.at ? formatDateTime(item.at) : "Now"}
                  {item.detail ? ` · ${item.detail}` : ""}
                </p>
                {item.open ? (
                  <button
                    type="button"
                    onClick={() => resolve(item.open!.alertId)}
                    disabled={busy !== null}
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-emerald-300"
                  >
                    {busy === item.open.alertId ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Mark resolved
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Header ⋮ menu: activate, edit, delete. */
function ActionsMenu({
  active,
  onActivate,
  onEdit,
  onDelete,
  onAddPlanting,
}: {
  active: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddPlanting: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Garden actions"
        title="Garden actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid h-[38px] w-[38px] place-items-center rounded-lg border border-slate-300 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${
          open ? "bg-slate-50 text-slate-800 dark:bg-slate-800 dark:text-slate-100" : ""
        }`}
      >
        <EllipsisVertical size={18} />
      </button>
      {open ? (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40"
        >
          <button role="menuitem" type="button" onClick={() => run(onAddPlanting)} className={itemClass}>
            <Package size={16} className="text-slate-400" />
            Add pot & plant
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          {active ? (
            <div
              role="menuitem"
              aria-disabled="true"
              className={`${itemClass} cursor-default text-emerald-600 hover:bg-transparent dark:text-emerald-400 dark:hover:bg-transparent`}
            >
              <CircleCheck size={16} />
              Active garden
            </div>
          ) : (
            <button role="menuitem" type="button" onClick={() => run(onActivate)} className={itemClass}>
              <CircleCheck size={16} className="text-slate-400" />
              Set as active
            </button>
          )}
          <button role="menuitem" type="button" onClick={() => run(onEdit)} className={itemClass}>
            <Pencil size={16} className="text-slate-400" />
            Edit
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button
            role="menuitem"
            type="button"
            onClick={() => run(onDelete)}
            className={`${itemClass} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10`}
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Header bell: a count of things needing attention, each can be marked resolved. */
function AttentionMenu({
  gardenId,
  loading,
  alerts,
  resolvedCount,
  onChange,
}: {
  gardenId: string;
  loading: boolean;
  alerts: GardenActivity["alerts"];
  resolvedCount: number;
  onChange: KeyedMutator<GardenActivity>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResolved, setLastResolved] = useState<GardenActivity["alerts"] | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setLastResolved(null);
    setError("");
  }, []);
  useDismiss(open, close, rootRef, triggerRef);

  const count = alerts.length;
  const critical = alerts.some((alert) => alert.severity === "critical" || alert.severity === "high");
  const label = loading
    ? "Checking garden health"
    : count
      ? `${count} ${count === 1 ? "thing needs" : "things need"} attention`
      : "Nothing needs attention";

  async function resolve(targets: GardenActivity["alerts"]) {
    setError("");
    setBusy(targets.length > 1 ? "all" : targets[0].id);
    const ids = new Set(targets.map((alert) => alert.id));
    try {
      // Optimistically drop them from the list while the server records it.
      await onChange(
        async (current) => {
          await Promise.all(
            targets.map((alert) => apiPost(`/api/gardens/${gardenId}/alerts/resolve`, { alertId: alert.id })),
          );
          return current;
        },
        {
          optimisticData: (current) =>
            current
              ? {
                  ...current,
                  alerts: current.alerts.filter((alert) => !ids.has(alert.id)),
                  resolvedAlerts: (current.resolvedAlerts ?? 0) + targets.length,
                }
              : current!,
          rollbackOnError: true,
          revalidate: true,
        },
      );
      setLastResolved(targets);
    } catch {
      setError("Couldn't mark that resolved. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    if (!lastResolved) return;
    const targets = lastResolved;
    setLastResolved(null);
    await Promise.all(
      targets.map((alert) =>
        fetch(`/api/gardens/${gardenId}/alerts/resolve`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId: alert.id }),
        }),
      ),
    );
    onChange();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={label}
        title={label}
        aria-haspopup="true"
        aria-expanded={open}
        className={`relative grid h-[38px] w-[38px] place-items-center rounded-lg border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
          count
            ? critical
              ? "border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
              : "border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/10"
            : "border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        }`}
      >
        <Bell size={17} className={count ? "animate-[wiggle_1s_ease-in-out_1] motion-reduce:animate-none" : ""} />
        {count ? (
          <span
            className={`absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900 ${
              critical ? "bg-rose-500" : "bg-amber-500"
            }`}
          >
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-fade-in absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-bold">{label}</p>
            {count > 1 ? (
              <button
                type="button"
                onClick={() => resolve(alerts)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                <CheckCheck size={14} />
                Resolve all
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Checking…</p>
          ) : count === 0 ? (
            <p className="flex items-center gap-2 px-4 py-5 text-sm text-emerald-600 dark:text-emerald-400">
              <CircleCheck size={18} />
              All good — this garden looks healthy.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {alerts.map((alert) => {
                const severe = alert.severity === "critical" || alert.severity === "high";
                return (
                  <li key={alert.id} className="flex gap-3 px-4 py-3">
                    <TriangleAlert
                      size={16}
                      className={`mt-0.5 shrink-0 ${severe ? "text-rose-500" : "text-amber-500"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{alert.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{alert.message}</p>
                      <button
                        type="button"
                        onClick={() => resolve([alert])}
                        disabled={busy !== null}
                        className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                      >
                        {busy === alert.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Mark resolved
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {error ? <p className="border-t border-slate-100 px-4 py-2 text-xs font-semibold text-rose-600 dark:border-slate-800">{error}</p> : null}

          {lastResolved ? (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-emerald-50/60 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-emerald-500/5">
              <span className="font-medium text-emerald-700 dark:text-emerald-300">
                {lastResolved.length === 1 ? `“${lastResolved[0].title}” marked resolved` : `${lastResolved.length} alerts marked resolved`}
              </span>
              <button type="button" onClick={undo} className="font-semibold text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                Undo
              </button>
            </div>
          ) : resolvedCount > 0 ? (
            <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400 dark:border-slate-800">
              {resolvedCount} resolved {resolvedCount === 1 ? "alert is" : "alerts are"} hidden. They come back if the problem returns.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WeatherSummary({
  activity,
  hasCoordinates,
  location,
  lat,
  lng,
}: {
  activity?: GardenActivity;
  hasCoordinates: boolean;
  location: string | null;
  lat: number | null;
  lng: number | null;
}) {
  // Fall back to a looked-up area name when the garden has none saved.
  const { data: lookup } = useSWR<{ label: string | null }>(
    hasCoordinates && !location ? `/api/geocode?lat=${lat}&lng=${lng}` : null,
    { revalidateOnFocus: false },
  );

  if (!hasCoordinates) {
    return <EmptyState icon={Sun} title="No weather yet" text="Set this garden's location to see local weather." />;
  }
  if (!activity) return <SkeletonRows rows={3} />;
  const weather = activity.weather;
  if (!weather) {
    return (
      <EmptyState
        icon={Sun}
        title="Weather unavailable"
        text={activity.weatherUnavailable ? "The weather service isn't responding. We'll retry shortly." : "No weather data yet."}
      />
    );
  }
  const area = location || lookup?.label || "Garden location";

  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
        <MapPin size={13} className="shrink-0" />
        <span className="truncate">{area}</span>
      </p>
      <div className="mt-2 flex items-baseline gap-3">
        <p className="text-5xl font-black tracking-tight">{weather.current.temp}°</p>
        <p className="text-sm font-medium capitalize text-slate-600 dark:text-slate-300">
          {weather.current.description}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 text-center dark:divide-slate-800 dark:border-slate-800">
        <WeatherFact icon={CloudRain} label="Rain chance" value={`${weather.current.rainProb}%`} />
        <WeatherFact icon={Droplets} label="Humidity" value={`${weather.current.humidity}%`} />
        <WeatherFact icon={Wind} label="Wind" value={`${weather.current.windSpeed} km/h`} />
      </div>
      {weather.forecast.length ? (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {weather.forecast.map((day) => (
            <div key={day.day} className="rounded-xl bg-slate-50 py-2 dark:bg-slate-950/60">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{day.day}</p>
              <p className="mt-0.5 text-sm font-bold">
                {day.high}° <span className="font-normal text-slate-400">{day.low}°</span>
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-slate-400">
        Updated {formatTime(weather.fetchedAt)}
        {weather.isStale ? " · showing last known data" : ""}
      </p>
    </div>
  );
}

const HEALTH_PILL: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  diseased: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  stressed: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  at_risk: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  recovering: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
};

function PotCard({
  pot,
  devices,
  onChange,
  onAddDevice,
  onEdit,
  onDelete,
  wateringHref,
  highlighted = false,
}: {
  pot: GardenActivity["pots"][number];
  devices: GardenActivity["devices"];
  onChange: () => void;
  onAddDevice: () => void;
  onEdit: () => void;
  onDelete: () => void;
  wateringHref: string;
  /** Deep-linked pot: scroll it into view and ring it. */
  highlighted?: boolean;
}) {
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);
  const moisture = pot.currentMoisture;
  const low = pot.moistureOnThreshold;
  const high = Math.max(pot.moistureOffThreshold ?? low, low);
  const state =
    moisture == null
      ? { text: "No reading", tone: "text-slate-400", bar: "bg-slate-300" }
      : moisture < low
        ? { text: "Too dry", tone: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" }
        : moisture > high
          ? { text: "Very wet", tone: "text-sky-600 dark:text-sky-400", bar: "bg-sky-500" }
          : { text: "Just right", tone: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" };
  const health = pot.plant?.healthStatus ?? "";
  const pumpOn = pot.pumpState === "on";
  const auto = pot.irrigationMode.toLowerCase() === "auto";

  return (
    <article
      ref={cardRef}
      id={`pot-${pot.id}`}
      className={`flex scroll-mt-24 flex-col rounded-2xl border bg-white shadow-sm transition dark:bg-slate-900 ${
        highlighted
          ? "border-emerald-500 ring-4 ring-emerald-500/20 dark:border-emerald-500/70"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      {/* Who */}
      <header className="flex items-start gap-3 p-4 pb-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Flower2 size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold leading-tight">{pot.label}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {pot.plant ? (
              <span className="truncate font-medium capitalize text-slate-700 dark:text-slate-200">{pot.plant.commonName}</span>
            ) : (
              <span className="italic">No plant</span>
            )}
            {health && health !== "unknown" ? (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize ${HEALTH_PILL[health] ?? HEALTH_PILL.stressed}`}>
                {health.replace("_", " ")}
              </span>
            ) : null}
          </p>
        </div>
        <PotMenu label={pot.label} onEdit={onEdit} onAddDevice={onAddDevice} onDelete={onDelete} wateringHref={wateringHref} />
      </header>

      {/* Moisture */}
      <div className="px-4">
        <div className="flex items-end justify-between">
          <p className="text-3xl font-black leading-none">
            {moisture == null ? <span className="text-slate-300 dark:text-slate-600">--</span> : moisture}
            {moisture == null ? null : <span className="ml-0.5 text-base font-bold text-slate-400">%</span>}
          </p>
          <p className={`text-xs font-bold ${state.tone}`}>{state.text}</p>
        </div>
        <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
          {/* Target band between the two watering levels. */}
          <span
            className="absolute inset-y-0 bg-emerald-500/20 dark:bg-emerald-400/15"
            style={{ left: `${low}%`, width: `${high - low}%` }}
          />
          {moisture != null ? (
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${state.bar}`}
              style={{ width: `${Math.min(100, Math.max(2, moisture))}%` }}
            />
          ) : null}
        </div>
        <p className="mt-1.5 flex justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span>
            Target {low}–{high}%
          </span>
          <span title={pot.moistureRecordedAt ? formatDateTime(pot.moistureRecordedAt) : undefined}>
            {pot.moistureRecordedAt ? timeAgo(pot.moistureRecordedAt) : "soil moisture"}
          </span>
        </p>
      </div>

      {/* Sensor */}
      <PotSensor pot={pot} devices={devices} onChange={onChange} onAddDevice={onAddDevice} />

      {/* Watering */}
      <footer className="mt-auto flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-xs dark:border-slate-800">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
            pumpOn
              ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          <Droplets size={12} />
          Pump {pumpOn ? "on" : "off"}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {auto ? "Auto watering" : "Manual"}
        </span>
      </footer>
    </article>
  );
}

/** Pot card ⋮ menu: edit, add a device, watering settings, delete. */
function PotMenu({
  label,
  onEdit,
  onAddDevice,
  onDelete,
  wateringHref,
}: {
  label: string;
  onEdit: () => void;
  onAddDevice: () => void;
  onDelete: () => void;
  wateringHref: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);
  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={rootRef} className="relative -mr-1.5 -mt-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <EllipsisVertical size={16} />
      </button>
      {open ? (
        <div role="menu" className="animate-fade-in absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
          <button role="menuitem" type="button" onClick={() => run(onEdit)} className={item}>
            <Pencil size={15} className="text-slate-400" />
            Edit pot & plant
          </button>
          <button role="menuitem" type="button" onClick={() => run(onAddDevice)} className={item}>
            <Cpu size={15} className="text-slate-400" />
            Add device
          </button>
          <Link role="menuitem" href={wateringHref} onClick={() => setOpen(false)} className={item}>
            <Droplets size={15} className="text-slate-400" />
            Watering settings
          </Link>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button
            role="menuitem"
            type="button"
            onClick={() => run(onDelete)}
            className={`${item} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10`}
          >
            <Trash2 size={15} />
            Delete pot
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** One-row sensor status for a pot, with a menu to connect or disconnect. */
function PotSensor({
  pot,
  devices,
  onChange,
  onAddDevice,
}: {
  pot: GardenActivity["pots"][number];
  devices: GardenActivity["devices"];
  onChange: () => void;
  onAddDevice: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  const connectedIds = new Set(pot.sensors.map((sensor) => sensor.id));
  // Devices added without a garden can be placed here too (they join this garden).
  const { data: allDevices } = useSWR<{ id: string; name: string; status: string; gardenId: string | null }[]>("/api/devices");
  const unassigned = (allDevices ?? []).filter((device) => !device.gardenId);
  const available = [
    ...devices.filter((device) => !connectedIds.has(device.id)),
    ...unassigned.map((device) => ({ ...device, unassigned: true as const })),
  ];
  const primary = pot.sensors[0];

  async function change(method: "POST" | "DELETE", deviceId: string) {
    setOpen(false);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/pots/${pot.id}/devices`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error);
      onChange();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't update the sensor.");
    } finally {
      setBusy(false);
    }
  }

  const itemClass =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div className="px-4 pb-3 pt-3">
      <div ref={rootRef} className="relative">
        {primary ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
            <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <Cpu size={14} />
              <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${deviceStatus(primary.status).dot}`} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-semibold">
                {primary.name}
                {pot.sensors.length > 1 ? <span className="font-normal text-slate-400"> +{pot.sensors.length - 1} more</span> : null}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{deviceStatus(primary.status).label}</p>
            </div>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((value) => !value)}
              disabled={busy}
              aria-label={`Sensor options for ${pot.label}`}
              aria-haspopup="menu"
              aria-expanded={open}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <EllipsisVertical size={15} />}
            </button>
          </div>
        ) : (
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left transition hover:border-emerald-400 hover:bg-emerald-50/50 disabled:opacity-50 dark:border-slate-700 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-500/5"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300">Connect a sensor</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">So moisture updates automatically</span>
            </span>
          </button>
        )}

        {open ? (
          <div
            role="menu"
            className="animate-fade-in absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40"
          >
            <button role="menuitem" type="button" onClick={() => { setOpen(false); onAddDevice(); }} className={itemClass}>
              <Plus size={14} className="text-emerald-600 dark:text-emerald-400" />
              Add new device
            </button>
            {available.length ? (
              <>
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Use existing</p>
                {available.map((device) => (
                  <button key={device.id} role="menuitem" type="button" onClick={() => change("POST", device.id)} className={itemClass}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${deviceStatus(device.status).dot}`} />
                    <span className="truncate">{device.name}</span>
                    {"unassigned" in device ? <span className="ml-auto shrink-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400">new</span> : null}
                  </button>
                ))}
              </>
            ) : null}
            {pot.sensors.length ? (
              <>
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                {pot.sensors.map((sensor) => (
                  <button
                    key={sensor.id}
                    role="menuitem"
                    type="button"
                    onClick={() => change("DELETE", sensor.id)}
                    className={`${itemClass} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10`}
                  >
                    <X size={14} />
                    <span className="truncate">Disconnect {sensor.name}</span>
                  </button>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}

function DeviceCard({
  device,
  pots,
}: {
  device: GardenActivity["devices"][number];
  /** Pots this device is connected to. */
  pots: { id: string; label: string }[];
}) {
  const status = deviceStatus(device.status);
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start gap-3 p-4">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <Cpu size={19} />
          <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${status.dot}`} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold leading-tight">{device.name}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {DEVICE_TYPE_LABELS[device.type] ?? device.type}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.pill}`}>{status.label}</span>
      </header>

      <dl className="space-y-2 px-4 pb-4 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500 dark:text-slate-400">Hardware ID</dt>
          <dd className="truncate font-mono text-[11px] font-semibold">{device.hardwareId}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500 dark:text-slate-400">Last seen</dt>
          <dd className="font-semibold" title={device.lastSeenAt ? formatDateTime(device.lastSeenAt) : undefined}>
            {device.lastSeenAt ? timeAgo(device.lastSeenAt) : "Never"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-slate-500 dark:text-slate-400">Feeds</dt>
          <dd className="flex flex-wrap justify-end gap-1">
            {pots.length ? (
              pots.map((pot) => (
                <span key={pot.id} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {pot.label}
                </span>
              ))
            ) : (
              <span className="text-slate-400">No pot yet</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-auto border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {status.hint}
      </p>
    </article>
  );
}


function ActivePill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
      Inactive
    </span>
  );
}

/** One inline fact in the header; the label is for screen readers / hover. */
function Meta({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <Icon size={14} className="shrink-0" />
      <dt className="sr-only">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Panel({
  title,
  description,
  className = "",
  children,
}: {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {title ? (
        <header className="mb-4">
          <h2 className="font-bold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

function AddButton({ onClick, icon: Icon, children }: { onClick: () => void; icon: LucideIcon; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700"
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
      {children}
    </Link>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  suffix,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left shadow-sm transition hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-black leading-tight">
          {value}
          {suffix ? <span className="ml-1 text-xs font-semibold text-slate-400">{suffix}</span> : null}
        </span>
        <span className="block truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </span>
    </button>
  );
}

function WeatherFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <Icon size={15} className="mx-auto text-slate-400" />
      <p className="mt-1 text-sm font-bold">{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Icon size={20} />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{text}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
      ))}
    </div>
  );
}

function DetailsLoading() {
  return (
    <div className="mx-auto max-w-6xl" aria-live="polite">
      <span className="sr-only">Loading garden details…</span>
      <div className="mb-4 h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-36 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-900" />
      <div className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-900" />
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeZone: "Asia/Dhaka" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-BD", { timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(
    new Date(value),
  );
}
