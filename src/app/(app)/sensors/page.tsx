"use client";

// PAGE: Sensors & devices across all gardens — status at a glance, search and
// filters, and registering an ESP32/sensor (its one-time key is shown once).
import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Check,
  CircleAlert,
  Clock,
  ArrowUpRight,
  Copy,
  Cpu,
  EllipsisVertical,
  Package,
  Plus,
  Search,
  Trash2,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { Input } from "@/components/Input";
import { SlideOver } from "@/components/SlideOver";
import { DeviceKey } from "@/components/GardenSetupPanels";
import { useDismiss } from "@/components/HeaderMenus";
import { GardenPicker } from "@/components/GardenPicker";
import { AddDeviceGuide } from "@/components/AddDeviceGuide";
import { DEVICE_TYPE_LABELS, deviceStatus, timeAgo } from "@/components/device-ui";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";

interface Garden {
  id: string;
  name: string;
  location: string | null;
}
interface Device {
  id: string;
  name: string;
  hardwareId: string;
  type: string;
  gardenId: string | null;
  status: "NEVER_SEEN" | "ONLINE" | "STALE" | "OFFLINE";
  lastSeenAt: string | null;
  garden: { name: string } | null;
  pots: { id: string; label: string }[];
}

type StatusFilter = "all" | "online" | "attention" | "waiting";

const fieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";

function bucket(status: Device["status"]): Exclude<StatusFilter, "all"> {
  if (status === "ONLINE") return "online";
  if (status === "NEVER_SEEN") return "waiting";
  return "attention";
}

// ?claim=<hardwareId>&code=<pairingCode> (the board's setup-page link) opens
// the Add device guide pre-filled; reading search params needs Suspense.
export default function SensorsPage() {
  return (
    <Suspense fallback={null}>
      <SensorsContent />
    </Suspense>
  );
}

function SensorsContent() {
  const searchParams = useSearchParams();
  const linkedBoard = searchParams.get("claim");
  const linkedCode = searchParams.get("code");
  const { data: gardens } = useSWR<Garden[]>("/api/gardens");
  const { data: devices, mutate } = useSWR<Device[]>("/api/devices", { refreshInterval: 10000 });
  const [query, setQuery] = useState("");
  const [gardenFilter, setGardenFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [registering, setRegistering] = useState(false);
  const [assigning, setAssigning] = useState<Device | null>(null);
  const [guide, setGuide] = useState<{ hardwareId: string | null; code: string | null } | null>(() =>
    linkedBoard ? { hardwareId: linkedBoard, code: linkedCode } : null,
  );

  const counts = useMemo(() => {
    const all = devices ?? [];
    return {
      total: all.length,
      online: all.filter((d) => bucket(d.status) === "online").length,
      attention: all.filter((d) => bucket(d.status) === "attention").length,
      waiting: all.filter((d) => bucket(d.status) === "waiting").length,
    };
  }, [devices]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (devices ?? []).filter((device) => {
      if (gardenFilter !== "all" && device.gardenId !== gardenFilter) return false;
      if (statusFilter !== "all" && bucket(device.status) !== statusFilter) return false;
      if (!needle) return true;
      return [device.name, device.hardwareId, device.garden?.name ?? "", ...device.pots.map((pot) => pot.label)].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
  }, [devices, query, gardenFilter, statusFilter]);

  const filtersActive = query.trim() !== "" || gardenFilter !== "all" || statusFilter !== "all";

  async function remove(device: Device) {
    if (!window.confirm(`Delete "${device.name}"? It will stop sending readings until registered again.`)) return;
    try {
      await apiDelete(`/api/devices/${device.id}`);
      mutate();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete device");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Sensors & devices"
        subtitle="Every ESP32 and sensor across your gardens, and what each one is measuring."
        action={
          <button
            type="button"
            onClick={() => setGuide({ hardwareId: null, code: null })}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus size={16} />
            Add device
          </button>
        }
      />

      <NewDevicesFound onSetUp={(hardwareId) => setGuide({ hardwareId, code: null })} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Cpu} label="Devices" value={counts.total} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <Tile
          icon={Wifi}
          label="Online"
          value={counts.online}
          tone="emerald"
          active={statusFilter === "online"}
          onClick={() => setStatusFilter(statusFilter === "online" ? "all" : "online")}
        />
        <Tile
          icon={CircleAlert}
          label="Needs attention"
          value={counts.attention}
          tone={counts.attention ? "rose" : undefined}
          active={statusFilter === "attention"}
          onClick={() => setStatusFilter(statusFilter === "attention" ? "all" : "attention")}
        />
        <Tile
          icon={Clock}
          label="Waiting for first reading"
          value={counts.waiting}
          active={statusFilter === "waiting"}
          onClick={() => setStatusFilter(statusFilter === "waiting" ? "all" : "waiting")}
        />
      </div>

      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search devices</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, hardware ID, garden or pot…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <GardenPicker
          gardens={gardens ?? []}
          value={gardenFilter}
          onChange={setGardenFilter}
          label=""
          allLabel="All gardens"
          className="w-full sm:w-72"
        />
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setGardenFilter("all");
              setStatusFilter("all");
            }}
            className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
          >
            <X size={14} />
            Clear
          </button>
        ) : null}
      </div>

      {!devices ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <Card className="flex flex-col items-center py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Cpu size={26} />
          </span>
          <h2 className="mt-4 text-lg font-black">No devices yet</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Register an ESP32 or sensor to start sending soil moisture and weather readings.
          </p>
          <button
            type="button"
            onClick={() => setGuide({ hardwareId: null, code: null })}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <Plus size={16} />
            Register your first device
          </button>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No devices match these filters.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((device) => (
            <DeviceCard key={device.id} device={device} onDelete={() => remove(device)} onAssign={() => setAssigning(device)} />
          ))}
        </div>
      )}

      <AddDeviceGuide
        open={guide !== null}
        onClose={() => setGuide(null)}
        gardens={gardens ?? []}
        initialHardwareId={guide?.hardwareId}
        initialCode={guide?.code}
        onDone={() => mutate()}
        onManual={() => {
          setGuide(null);
          setRegistering(true);
        }}
      />

      <AssignPanel
        device={assigning}
        gardens={gardens ?? []}
        onClose={() => setAssigning(null)}
        onSaved={() => {
          setAssigning(null);
          mutate();
        }}
      />

      <RegisterPanel
        open={registering}
        onClose={() => setRegistering(false)}
        gardens={gardens ?? []}
        onCreated={() => mutate()}
      />
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "emerald" | "rose";
  active: boolean;
  onClick: () => void;
}) {
  const iconTone =
    tone === "rose"
      ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left shadow-sm transition dark:bg-slate-900 ${
        active
          ? "border-emerald-500/60 ring-1 ring-emerald-500/30"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
      }`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconTone}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-black leading-tight">{value}</span>
        <span className="block truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </span>
    </button>
  );
}

function DeviceCard({ device, onDelete, onAssign }: { device: Device; onDelete: () => void; onAssign: () => void }) {
  const status = deviceStatus(device.status);
  const [copied, setCopied] = useState(false);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(device.hardwareId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; nothing else to do.
    }
  }

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
        <DeviceMenu device={device} onDelete={onDelete} onAssign={onAssign} />
      </header>

      <dl className="space-y-2 px-4 pb-4 text-xs">
        <Row label="Garden">
          {device.gardenId && device.garden ? (
            <Link href={`/gardens/${device.gardenId}`} className="truncate font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              {device.garden.name}
            </Link>
          ) : (
            <button type="button" onClick={onAssign} className="inline-flex items-center gap-1 font-semibold text-amber-600 hover:underline dark:text-amber-400">
              Not in a garden · Assign
            </button>
          )}
        </Row>
        <Row label="Feeds">
          {device.pots.length ? (
            <span className="flex flex-wrap justify-end gap-1">
              {device.pots.map((pot) => (
                <Link
                  key={pot.id}
                  href={potHref(device.gardenId ?? "", pot.id)}
                  title={`Show ${pot.label}`}
                  className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 hover:underline dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                >
                  {pot.label}
                  <ArrowUpRight size={11} aria-hidden="true" />
                </Link>
              ))}
            </span>
          ) : (
            <span className="text-slate-400">No pot yet</span>
          )}
        </Row>
        <Row label="Hardware ID">
          <button
            type="button"
            onClick={copyId}
            title="Copy hardware ID"
            className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px] font-semibold hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            <span className="truncate">{device.hardwareId}</span>
            {copied ? <Check size={12} className="shrink-0 text-emerald-500" /> : <Copy size={12} className="shrink-0 text-slate-400" />}
          </button>
        </Row>
        <Row label="Last seen">
          <span className="font-semibold" title={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : undefined}>
            {device.lastSeenAt ? timeAgo(device.lastSeenAt) : "Never"}
          </span>
        </Row>
      </dl>

      <p className="mt-auto border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {status.hint}
      </p>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="flex min-w-0 justify-end">{children}</dd>
    </div>
  );
}

/** Garden details, Pots tab, scrolled to this pot. */
function potHref(gardenId: string, potId: string) {
  return `/gardens/${gardenId}?tab=pots&pot=${potId}`;
}

function DeviceMenu({ device, onDelete, onAssign }: { device: Device; onDelete: () => void; onAssign: () => void }) {
  const name = device.name;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);
  return (
    <div ref={rootRef} className="relative -mr-1.5 -mt-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <EllipsisVertical size={16} />
      </button>
      {open ? (
        <div role="menu" className="animate-fade-in absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          {device.pots.length ? (
            <>
              <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Connected pots</p>
              {device.pots.map((pot) => (
                <Link
                  key={pot.id}
                  role="menuitem"
                  href={potHref(device.gardenId ?? "", pot.id)}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Package size={15} className="text-emerald-500" />
                  Show {pot.label}
                </Link>
              ))}
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            </>
          ) : null}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onAssign();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Package size={15} className="text-slate-400" />
            {device.gardenId ? "Move or rename" : "Assign to garden & pot"}
          </button>
          {device.gardenId && device.garden ? (
            <Link
              role="menuitem"
              href={`/gardens/${device.gardenId}?tab=devices`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ArrowUpRight size={15} className="text-slate-400" />
              Open {device.garden.name}
            </Link>
          ) : null}
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface FoundBoard {
  hardwareId: string;
  lastSeenAt: string;
  existingName: string | null;
}

/** Boards that announced themselves on the network and are waiting to be added. */
function NewDevicesFound({ onSetUp }: { onSetUp: (hardwareId: string) => void }) {
  const { data: found } = useSWR<FoundBoard[]>("/api/devices/pairing", { refreshInterval: 4000 });
  if (!found?.length) return null;

  return (
    <section className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/5">
      <div className="flex items-start gap-3">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
          <Wifi size={17} />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400 motion-reduce:hidden" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-emerald-900 dark:text-emerald-100">
            New {found.length === 1 ? "device" : "devices"} found
          </h2>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-200/70">
            These boards are on your network and ready to add. Choose a pot, then press the board&apos;s BOOT button.
          </p>
        </div>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {found.map((board) => (
          <li key={board.hardwareId} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-slate-900">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <Cpu size={16} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-mono text-sm font-bold">{board.hardwareId}</span>
              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                {board.existingName ? `Was “${board.existingName}” · ` : ""}seen {timeAgo(board.lastSeenAt)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onSetUp(board.hardwareId)}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Set up
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Place a device in a garden and pot (or take it out), and rename it. */
function AssignPanel({
  device,
  gardens,
  onClose,
  onSaved,
}: {
  device: Device | null;
  gardens: Garden[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <SlideOver
      open={device !== null}
      onClose={onClose}
      title={device?.gardenId ? `Move ${device.name}` : `Assign ${device?.name ?? "device"}`}
      description="Choose where this board lives. Its readings and pump follow the pot you pick."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button type="submit" form="assign-form" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
            <Check size={16} />
            Save
          </button>
        </>
      }
    >
      {device ? <AssignFields key={device.id} device={device} gardens={gardens} onSaved={onSaved} /> : null}
    </SlideOver>
  );
}

function AssignFields({ device, gardens, onSaved }: { device: Device; gardens: Garden[]; onSaved: () => void }) {
  const [gardenId, setGardenId] = useState(device.gardenId ?? "");
  const [potId, setPotId] = useState(device.pots[0]?.id ?? "");
  const [name, setName] = useState(device.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: pots } = useSWR<{ id: string; label: string; plant: { commonName: string } | null }[]>(
    gardenId ? `/api/pots?gardenId=${gardenId}` : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await apiPatch(`/api/devices/${device.id}`, {
        name: name.trim(),
        gardenId: gardenId || null,
        potId: gardenId && potId ? potId : null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="assign-form" onSubmit={submit} className="space-y-4" aria-busy={saving}>
      <Input label="Device name" value={name} onChange={setName} required />
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Garden</span>
        <select
          value={gardenId}
          onChange={(e) => {
            setGardenId(e.target.value);
            setPotId("");
          }}
          className={fieldClass}
        >
          <option value="">Not in a garden</option>
          {gardens.map((garden) => (
            <option key={garden.id} value={garden.id}>
              {garden.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Pot it measures and waters</span>
        <select value={potId} onChange={(e) => setPotId(e.target.value)} disabled={!gardenId} className={`${fieldClass} disabled:opacity-50`}>
          <option value="">No pot</option>
          {(pots ?? []).map((pot) => (
            <option key={pot.id} value={pot.id}>
              {pot.label}
              {pot.plant ? ` — ${pot.plant.commonName}` : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Changes apply right away — the board doesn&apos;t need to be re-flashed.
      </p>
      {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}
      {saving ? <p className="text-sm text-slate-500">Saving…</p> : null}
    </form>
  );
}

function RegisterPanel({
  open,
  onClose,
  gardens,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  gardens: Garden[];
  onCreated: () => void;
}) {
  const [created, setCreated] = useState<{ name: string; hardwareId: string; key: string } | null>(null);
  function close() {
    setCreated(null);
    onClose();
  }
  return (
    <SlideOver
      open={open}
      onClose={close}
      title={created ? "Device registered" : "Register device"}
      description={
        created
          ? "Copy the device key now — for security it is shown only once."
          : "Choose its garden, and the pot it measures if it's a soil sensor."
      }
      footer={
        created ? (
          <button type="button" onClick={close} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="register-device-form"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Check size={16} />
              Register device
            </button>
          </>
        )
      }
    >
      {open && created ? (
        <DeviceKey created={created} />
      ) : open ? (
        <RegisterFields
          gardens={gardens}
          onCreated={(result) => {
            setCreated(result);
            onCreated();
          }}
        />
      ) : null}
    </SlideOver>
  );
}

function RegisterFields({
  gardens,
  onCreated,
}: {
  gardens: Garden[];
  onCreated: (result: { name: string; hardwareId: string; key: string }) => void;
}) {
  const [gardenId, setGardenId] = useState(gardens[0]?.id ?? "");
  const [potId, setPotId] = useState("");
  const [name, setName] = useState("");
  const [hardwareId, setHardwareId] = useState("");
  const [type, setType] = useState("esp32_node");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: pots } = useSWR<{ id: string; label: string; plant: { commonName: string } | null }[]>(
    gardenId ? `/api/pots?gardenId=${gardenId}` : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await apiPost<{ device: { name: string; hardwareId: string }; deviceKey: string }>("/api/devices", {
        gardenId,
        potId: potId || undefined,
        name: name.trim(),
        hardwareId: hardwareId.trim(),
        type,
      });
      onCreated({ name: result.device.name, hardwareId: result.device.hardwareId, key: result.deviceKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register device");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="register-device-form" onSubmit={submit} className="space-y-4" aria-busy={saving}>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Garden</span>
        <select
          value={gardenId}
          onChange={(e) => {
            setGardenId(e.target.value);
            setPotId("");
          }}
          required
          className={fieldClass}
        >
          {gardens.map((garden) => (
            <option key={garden.id} value={garden.id}>
              {garden.name}
            </option>
          ))}
        </select>
      </label>
      <div>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Connect to pot (optional)</span>
          <select value={potId} onChange={(e) => setPotId(e.target.value)} className={fieldClass}>
            <option value="">Not now / multi-pot node</option>
            {(pots ?? []).map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.label}
                {pot.plant ? ` — ${pot.plant.commonName}` : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          A sensor connected to one pot updates that pot&apos;s moisture without needing pot IDs in its firmware.
        </p>
      </div>
      <Input label="Device name" value={name} onChange={setName} placeholder="e.g. Balcony node" required />
      <div>
        <Input label="Hardware ID" value={hardwareId} onChange={setHardwareId} placeholder="e.g. ESP32-GARDEN-03" required />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The ID set in the device firmware. Must be unique.</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Type</span>
        <select value={type} onChange={(e) => setType(e.target.value)} className={fieldClass}>
          {Object.entries(DEVICE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}
      {saving ? <p className="text-sm text-slate-500">Saving…</p> : null}
    </form>
  );
}
