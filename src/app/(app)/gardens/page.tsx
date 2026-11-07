"use client";

// PAGE: Gardens CRUD - create/list/edit/delete growing areas and choose the
// active garden used by the rest of the app.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Cpu,
  Droplets,
  EllipsisVertical,
  Eye,
  Flower2,
  Info,
  MapPin,
  OctagonAlert,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Trees,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import {
  GARDEN_TYPES,
  GardenFields,
  emptyForm,
  gardenToForm,
  gardenType,
  parseGardenForm,
  type Garden,
  type GardenForm,
  type GardenOverview,
} from "@/components/GardenForm";
import { SlideOver } from "@/components/SlideOver";
import { useDismiss } from "@/components/HeaderMenus";
import { errorMessage, useFeedback } from "@/components/Feedback";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";
import { getSelectedGardenId, setSelectedGardenId } from "@/lib/selected-garden";

const PAGE_SIZE = 6;

type StatusFilter = "all" | "online" | "attention" | "none";
type SortKey = "recent" | "name" | "pots" | "created";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "online", label: "All devices online" },
  { value: "attention", label: "Needs attention" },
  { value: "none", label: "No devices" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently updated" },
  { value: "created", label: "Newest first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "pots", label: "Most pots" },
];

function deviceHealth(garden: Garden, overview?: GardenOverview): Exclude<StatusFilter, "all"> {
  // Anything the details page would flag (dry pot, failed pump, disease…) needs attention.
  if (overview?.alerts?.length) return "attention";
  if (garden._count.devices === 0) return "none";
  return overview && overview.deviceSummary.online === garden._count.devices ? "online" : "attention";
}

/** Page numbers to show, with "…" gaps for long ranges: 1 … 4 5 6 … 12 */
function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export default function GardensPage() {
  const { confirm, toast } = useFeedback();
  const { data: gardens, mutate } = useSWR<Garden[]>("/api/gardens");
  const { data: gardenOverviews } = useSWR<GardenOverview[]>(
    "/api/gardens/overview",
    { refreshInterval: 30000 },
  );
  const [selectedId, setSelectedId] = useState("");
  // null = drawer closed, "new" = creating, otherwise the id being edited.
  const [drawer, setDrawer] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<GardenForm>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [requestedPage, setRequestedPage] = useState(1);

  // The active garden: the one picked here, else the one saved last time, else the first.
  const savedGardenId = getSelectedGardenId();
  const selectedGarden =
    gardens?.find((garden) => garden.id === selectedId) ??
    gardens?.find((garden) => garden.id === savedGardenId) ??
    gardens?.[0];
  const activeSelectedId = selectedGarden?.id ?? "";
  const overviewByGardenId = new Map(
    (gardenOverviews ?? []).map((overview) => [overview.id, overview]),
  );
  const editingGarden = drawer && drawer !== "new" ? gardens?.find((g) => g.id === drawer) : undefined;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const overviews = new Map((gardenOverviews ?? []).map((o) => [o.id, o]));
    const list = (gardens ?? []).filter((garden) => {
      if (typeFilter !== "all" && garden.type !== typeFilter) return false;
      if (statusFilter !== "all" && deviceHealth(garden, overviews.get(garden.id)) !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      return [garden.name, garden.location ?? "", gardenType(garden.type).label].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
    return list.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "pots":
          return b._count.pots - a._count.pots || a.name.localeCompare(b.name);
        case "created":
          return b.createdAt.localeCompare(a.createdAt);
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [gardens, gardenOverviews, query, typeFilter, statusFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp rather than reset in an effect, so deleting the last card on a page
  // simply lands on the previous one.
  const page = Math.min(requestedPage, totalPages);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtersActive = query.trim() !== "" || typeFilter !== "all" || statusFilter !== "all";

  // Any change to what's being listed starts again from page 1.
  function updateFilter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setRequestedPage(1);
    };
  }

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setRequestedPage(1);
  }

  const totals = (gardens ?? []).reduce(
    (sum, garden) => ({
      pots: sum.pots + garden._count.pots,
      plants: sum.plants + garden._count.plants,
      devices: sum.devices + garden._count.devices,
    }),
    { pots: 0, plants: 0, devices: 0 },
  );
  const devicesOnline = (gardenOverviews ?? []).reduce(
    (sum, overview) => sum + overview.deviceSummary.online,
    0,
  );
  const pumpsOn = (gardenOverviews ?? []).reduce((sum, overview) => sum + overview.pumpsOn, 0);

  useEffect(() => {
    if (selectedId) setSelectedGardenId(selectedId);
  }, [selectedId]);

  function openCreate() {
    setError("");
    setForm(emptyForm);
    setDrawer("new");
  }

  function openEdit(garden: Garden) {
    setError("");
    setForm(gardenToForm(garden));
    setDrawer(garden.id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!drawer) return;
    setError("");
    setSaving(true);
    try {
      if (drawer === "new") {
        await apiPost("/api/gardens", parseGardenForm(form));
      } else {
        await apiPatch(`/api/gardens/${drawer}`, parseGardenForm(form));
      }
      toast.success(drawer === "new" ? `${form.name} created` : `${form.name} saved`);
      setDrawer(null);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(garden: Garden) {
    const ok = await confirm({
      title: `Delete “${garden.name}”?`,
      message: `Its ${garden._count.pots} pots, ${garden._count.plants} plants, devices and all reading history will be removed. This can't be undone.`,
      confirmLabel: "Delete garden",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiDelete(`/api/gardens/${garden.id}`);
      if (activeSelectedId === garden.id) setSelectedId("");
      mutate();
      toast.success(`${garden.name} deleted`);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete garden"));
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Gardens"
        subtitle="Group your pots, plants and devices by growing area."
        action={
          gardens?.length ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <Plus size={16} />
              New garden
            </button>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile icon={Trees} label="Gardens" value={gardens?.length ?? 0} />
        <SummaryTile icon={Package} label="Pots" value={totals.pots} />
        <SummaryTile icon={Flower2} label="Plants" value={totals.plants} />
        <SummaryTile
          icon={Cpu}
          label="Devices online"
          value={
            <>
              {devicesOnline}
              <span className="text-base font-bold text-slate-400"> / {totals.devices}</span>
            </>
          }
          note={pumpsOn > 0 ? `${pumpsOn} pump${pumpsOn > 1 ? "s" : ""} running` : undefined}
        />
      </div>

      {!gardens ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : gardens.length === 0 ? (
        <Card className="flex flex-col items-center py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Trees size={26} />
          </span>
          <h2 className="mt-4 text-lg font-black">No gardens yet</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Create a garden for each growing area, then add pots, plants and devices to it.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <Plus size={16} />
            Create your first garden
          </button>
        </Card>
      ) : (
        <>
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search gardens</span>
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => updateFilter(setQuery)(e.target.value)}
              placeholder="Search by name, location or type…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => updateFilter(setQuery)("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:items-center">
            <ToolbarSelect
              label="Type"
              value={typeFilter}
              onChange={updateFilter(setTypeFilter)}
              options={[
                { value: "all", label: "All types" },
                ...Object.entries(GARDEN_TYPES).map(([value, type]) => ({ value, label: type.label })),
              ]}
            />
            <ToolbarSelect
              label="Device status"
              value={statusFilter}
              onChange={(value) => updateFilter(setStatusFilter)(value as StatusFilter)}
              options={STATUS_FILTERS}
            />
            <ToolbarSelect
              label="Sort by"
              value={sort}
              onChange={(value) => updateFilter(setSort)(value as SortKey)}
              options={SORTS}
              className="col-span-2 sm:col-span-1"
            />
            {filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 sm:col-span-3 dark:text-emerald-400 dark:hover:bg-emerald-500/10 lg:col-span-1"
              >
                <X size={14} />
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card className="flex flex-col items-center py-12 text-center">
            <Search size={24} className="text-slate-400" />
            <h2 className="mt-3 font-black">No gardens match</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Try a different search term or remove some filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Clear filters
            </button>
          </Card>
        ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageItems.map((garden) => (
            <GardenCard
              key={garden.id}
              garden={garden}
              overview={overviewByGardenId.get(garden.id)}
              active={garden.id === activeSelectedId}
              onActivate={() => setSelectedId(garden.id)}
              onEdit={() => openEdit(garden)}
              onDelete={() => remove(garden)}
            />
          ))}
        </div>
        )}

        {totalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            from={(page - 1) * PAGE_SIZE + 1}
            to={Math.min(page * PAGE_SIZE, filtered.length)}
            total={filtered.length}
            onChange={setRequestedPage}
          />
        ) : null}
        </>
      )}

      <SlideOver
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={editingGarden ? `Edit ${editingGarden.name}` : "New garden"}
        description="Coordinates are used for live weather and rain-aware irrigation."
        footer={
          <>
            <button
              type="button"
              onClick={() => setDrawer(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="garden-form"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {editingGarden ? <Check size={16} /> : <Plus size={16} />}
              {saving ? "Saving…" : editingGarden ? "Save changes" : "Create garden"}
            </button>
          </>
        }
      >
        <form id="garden-form" onSubmit={submit} className="space-y-4">
          <GardenFields value={form} onChange={setForm} withPlaceholders={!editingGarden} />
          {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}
        </form>
      </SlideOver>
    </div>
  );
}

function ToolbarSelect({
  label,
  value,
  onChange,
  options,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-white py-2 pl-3 pr-8 text-sm font-medium focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:bg-slate-950 lg:w-48 ${
          value === options[0].value
            ? "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200"
            : "border-emerald-500/60 text-emerald-700 dark:border-emerald-500/50 dark:text-emerald-300"
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Pagination({
  page,
  totalPages,
  from,
  to,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const buttonClass =
    "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav
      aria-label="Gardens pagination"
      className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{from}–{to}</span> of{" "}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className={`${buttonClass} border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800`}
        >
          <ChevronLeft size={16} />
        </button>
        {pageList(page, totalPages).map((item, index) =>
          item === "…" ? (
            <span key={`gap-${index}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              aria-label={`Page ${item}`}
              aria-current={item === page ? "page" : undefined}
              className={`${buttonClass} ${
                item === page
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          className={`${buttonClass} border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800`}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Icon size={15} className="text-emerald-600 dark:text-emerald-400" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-black">{value}</p>
      {note ? <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">{note}</p> : null}
    </div>
  );
}

function deviceStatusSummary(devices: number, overview?: GardenOverview) {
  // No sensor watching this garden: flag it red so it stands out.
  if (devices === 0) return { dot: "bg-rose-500", text: "No devices" };
  if (!overview) return { dot: "bg-slate-300 dark:bg-slate-600", text: "Checking…" };
  const { online, stale = 0, offline } = overview.deviceSummary;
  // Devices that have never reported are not counted in any bucket.
  const neverSeen = Math.max(0, devices - online - stale - offline);
  if (online === devices) {
    return { dot: "bg-emerald-500", text: devices === 1 ? "Online" : `All ${devices} online` };
  }
  const parts: string[] = [];
  if (online) parts.push(`${online} online`);
  if (offline) parts.push(`${offline} offline`);
  if (stale) parts.push(`${stale} stale`);
  if (neverSeen) parts.push(`${neverSeen} not connected`);
  const dot = offline ? "bg-rose-500" : stale ? "bg-amber-500" : "bg-slate-400";
  return { dot, text: parts.join(" · ") };
}

function GardenCard({
  garden,
  overview,
  active,
  onActivate,
  onEdit,
  onDelete,
}: {
  garden: Garden;
  overview?: GardenOverview;
  active: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const type = gardenType(garden.type);
  const status = deviceStatusSummary(garden._count.devices, overview);
  const pumpsOn = overview?.pumpsOn ?? 0;
  const detailsHref = `/gardens/${garden.id}`;
  const alerts = overview?.alerts ?? [];
  const critical = alerts.some((alert) => alert.severity === "critical");

  return (
    <article
      className={`group/card relative flex flex-col rounded-2xl border bg-white shadow-sm transition hover:shadow-md dark:bg-slate-900 ${
        critical
          ? "border-rose-400/70 ring-1 ring-rose-500/25 dark:border-rose-500/50"
          : active
            ? "border-emerald-500/60 ring-1 ring-emerald-500/30 dark:border-emerald-500/50"
            : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
      }`}
    >
      <div className="flex items-start gap-3.5 p-5">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${type.iconClass}`}>
          <type.icon size={22} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <Link
              href={detailsHref}
              className="truncate text-base font-bold text-slate-950 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400"
              title={garden.name}
            >
              {garden.name}
            </Link>
            {active ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                Inactive
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{garden.location || "No location"}</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">•</span>
            <span className="shrink-0">{type.label}</span>
          </p>
        </div>
        {alerts.length ? (
          <Link
            href={detailsHref}
            title={`${alerts.length} ${alerts.length === 1 ? "thing needs" : "things need"} attention`}
            className={`relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
              critical ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
            }`}
          >
            <Bell size={16} />
            <span
              className={`absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-black text-white ring-2 ring-white dark:ring-slate-900 ${
                critical ? "bg-rose-600" : "bg-amber-500"
              }`}
            >
              {alerts.length}
            </span>
          </Link>
        ) : null}
        <GardenMenu
          gardenName={garden.name}
          detailsHref={detailsHref}
          active={active}
          onActivate={onActivate}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 text-xs font-medium text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.text}
        </span>
        {pumpsOn > 0 ? (
          <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
            <Droplets size={13} />
            {pumpsOn} pump{pumpsOn > 1 ? "s" : ""} running
          </span>
        ) : null}
      </div>

      {alerts.length ? <CardAlerts alerts={alerts} href={detailsHref} /> : null}

      <dl className="mx-5 mt-4 grid grid-cols-3 gap-2">
        <CardStat icon={Package} label="Pots" value={garden._count.pots} />
        <CardStat icon={Flower2} label="Plants" value={garden._count.plants} />
        <CardStat icon={Cpu} label="Devices" value={garden._count.devices} />
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <span className="truncate text-xs text-slate-400" title="Latitude, longitude">
          {garden.lat != null && garden.lng != null
            ? `${garden.lat.toFixed(3)}, ${garden.lng.toFixed(3)}`
            : "No coordinates"}
        </span>
        <Link
          href={detailsHref}
          className="-mr-2 inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
        >
          View
          <ArrowRight size={15} className="transition-transform group-hover/card:translate-x-0.5" />
        </Link>
      </div>
    </article>
  );
}

const ALERT_STYLE = {
  critical: { icon: OctagonAlert, row: "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200", iconClass: "text-rose-600 dark:text-rose-400" },
  warning: { icon: TriangleAlert, row: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200", iconClass: "text-amber-600 dark:text-amber-400" },
  info: { icon: Info, row: "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-200", iconClass: "text-sky-600 dark:text-sky-400" },
} as const;

/** The two most serious open alerts, with "+N more" — full list on the details page. */
function CardAlerts({ alerts, href }: { alerts: NonNullable<GardenOverview["alerts"]>; href: string }) {
  const shown = alerts.slice(0, 2);
  return (
    <div className="mx-5 mt-3 space-y-1.5">
      {shown.map((alert) => {
        const style = ALERT_STYLE[alert.severity];
        return (
          <Link key={alert.id} href={href} className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs transition hover:opacity-90 ${style.row}`}>
            <style.icon size={14} className={`mt-px shrink-0 ${style.iconClass}`} />
            <span className="min-w-0">
              <span className="block font-bold">{alert.title}</span>
              <span className="block truncate opacity-80">{alert.message}</span>
            </span>
          </Link>
        );
      })}
      {alerts.length > shown.length ? (
        <Link href={href} className="block px-1 text-xs font-semibold text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400">
          +{alerts.length - shown.length} more — see all in garden details
        </Link>
      ) : null}
    </div>
  );
}

function CardStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-950/60">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon size={12} />
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold leading-none text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}

function GardenMenu({
  gardenName,
  detailsHref,
  active,
  onActivate,
  onEdit,
  onDelete,
}: {
  gardenName: string;
  detailsHref: string;
  active: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800";

  return (
    <div ref={rootRef} className="relative -mr-2 -mt-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Actions for ${gardenName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
          open ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" : ""
        }`}
      >
        <EllipsisVertical size={18} />
      </button>
      {open ? (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40"
        >
          <Link role="menuitem" href={detailsHref} onClick={() => setOpen(false)} className={itemClass}>
            <Eye size={16} className="text-slate-400" />
            View details
          </Link>
          <button role="menuitem" type="button" onClick={() => run(onEdit)} className={itemClass}>
            <Pencil size={16} className="text-slate-400" />
            Edit
          </button>
          {active ? (
            <div role="menuitem" aria-disabled="true" className={`${itemClass} cursor-default text-emerald-600 hover:bg-transparent dark:text-emerald-400 dark:hover:bg-transparent`}>
              <CircleCheck size={16} />
              Active garden
            </div>
          ) : (
            <button role="menuitem" type="button" onClick={() => run(onActivate)} className={itemClass}>
              <CircleCheck size={16} className="text-slate-400" />
              Set as active
            </button>
          )}
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button
            role="menuitem"
            type="button"
            onClick={() => run(onDelete)}
            className={`${itemClass} text-rose-600 hover:bg-rose-50 focus-visible:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:focus-visible:bg-rose-500/10`}
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
