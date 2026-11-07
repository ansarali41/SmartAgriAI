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
  Droplets,
  EllipsisVertical,
  Gauge,
  Loader2,
  Moon,
  Package,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  Wifi,
  WifiOff,
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
import { errorMessage, useFeedback } from "@/components/Feedback";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";
import { useNow } from "@/components/ListPage";
import { supportsRemotePorts } from "@/lib/device-pot";

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
  /** Connected pots, each with the board port it's on. */
  pots: { id: string; label: string; port: number }[];
  /** How many pots this board can serve (one per port). */
  portCount: number;
  /** Last report per port: probe reading (null = no probe reading) and pump relay state. */
  portStatus: { port: number; moisture: number | null; pump: boolean | null }[] | null;
  /** e.g. "smartagri-2.9"; 2.9+ can add / remove ports from the app. */
  firmwareVersion: string | null;
  pendingAction: DeviceAction | null;
  pendingActionAt: string | null;
}

type DeviceAction = "RESTART" | "RESET_WIFI" | "SLEEP" | "FACTORY_RESET";

/** Same as the server: an action the board hasn't picked up in 2 min is dropped. */
const ACTION_TTL_MS = 2 * 60 * 1000;

const ACTIONS: Record<
  DeviceAction,
  { label: string; icon: LucideIcon; doing: string; confirm: { title: string; message: string; confirmLabel: string; danger?: boolean }; done: string }
> = {
  RESTART: {
    label: "Restart",
    icon: RotateCw,
    doing: "Restarting",
    confirm: { title: "Restart {name}?", message: "The pump switches off and the board reboots. It's back online in about 10 seconds.", confirmLabel: "Restart" },
    done: "Restart sent — back online in about 10 seconds",
  },
  RESET_WIFI: {
    label: "Reset Wi-Fi",
    icon: WifiOff,
    doing: "Resetting Wi-Fi",
    confirm: {
      title: "Reset Wi-Fi on {name}?",
      message:
        "It forgets the Wi-Fi network and opens the “SmartAgri-Setup” hotspot. Join it from your phone to choose a network again. It stays in your account.",
      confirmLabel: "Reset Wi-Fi",
    },
    done: "Wi-Fi reset sent — join “SmartAgri-Setup” from your phone",
  },
  SLEEP: {
    label: "Turn off (sleep)",
    icon: Moon,
    doing: "Turning off",
    confirm: {
      title: "Turn off {name}?",
      message: "The pump switches off and the board goes to deep sleep (Wi-Fi off, almost no power). It can't be woken from the app — press BOOT or EN on the board to turn it back on.",
      confirmLabel: "Turn off",
    },
    done: "Turning off — press BOOT on the board to wake it",
  },
  FACTORY_RESET: {
    label: "Factory reset",
    icon: RotateCcw,
    doing: "Factory resetting",
    confirm: {
      title: "Factory reset {name}?",
      message:
        "The board erases its Wi-Fi, server address and key, and is removed from your account. Its past readings are deleted too. To use it again, set it up from Add device.",
      confirmLabel: "Factory reset",
      danger: true,
    },
    done: "Factory reset sent — the board will be removed",
  },
};

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
  const { confirm, toast } = useFeedback();
  const searchParams = useSearchParams();
  const linkedBoard = searchParams.get("claim");
  const linkedCode = searchParams.get("code");
  const { data: gardens } = useSWR<Garden[]>("/api/gardens");
  const { data: devices, mutate } = useSWR<Device[]>("/api/devices", { refreshInterval: 3000 });
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

  async function sendAction(device: Device, action: DeviceAction) {
    const spec = ACTIONS[action];
    const ok = await confirm({
      title: spec.confirm.title.replace("{name}", device.name),
      message: spec.confirm.message,
      confirmLabel: spec.confirm.confirmLabel,
      tone: spec.confirm.danger ? "danger" : "default",
    });
    if (!ok) return;
    try {
      await apiPost(`/api/devices/${device.id}/action`, { action });
      mutate();
      toast.success(spec.done);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send that to the board"));
    }
  }

  async function cancelAction(device: Device) {
    try {
      await apiDelete(`/api/devices/${device.id}/action`);
      mutate();
      toast.info("Cancelled");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't cancel"));
    }
  }

  async function remove(device: Device) {
    const ok = await confirm({
      title: `Delete ${device.name}?`,
      message: "It stops sending readings and controlling its pump. To use the board again, add it again from Add device.",
      confirmLabel: "Delete device",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiDelete(`/api/devices/${device.id}`);
      mutate();
      toast.success(`${device.name} deleted`);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete device"));
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Devices"
        subtitle="Every ESP32 device across your gardens, and which pots each one serves."
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
            <DeviceCard
              key={device.id}
              device={device}
              onDelete={() => remove(device)}
              onAssign={() => setAssigning(device)}
              onAction={(action) => sendAction(device, action)}
              onCancelAction={() => cancelAction(device)}
              onChanged={() => mutate()}
            />
          ))}
        </div>
      )}

      <AddDeviceGuide
        open={guide !== null}
        onClose={() => setGuide(null)}
        gardens={gardens ?? []}
        initialHardwareId={guide?.hardwareId}
        initialCode={guide?.code}
        onDone={() => {
          mutate();
          toast.success("Device connected");
        }}
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
          toast.success("Device updated");
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

function DeviceCard({
  device,
  onDelete,
  onAssign,
  onAction,
  onCancelAction,
  onChanged,
}: {
  device: Device;
  onDelete: () => void;
  onAssign: () => void;
  onAction: (action: DeviceAction) => void;
  onCancelAction: () => void;
  onChanged: () => void;
}) {
  const now = useNow(5000);
  const pending =
    device.pendingAction && device.pendingActionAt && now - new Date(device.pendingActionAt).getTime() < ACTION_TTL_MS ? ACTIONS[device.pendingAction] : null;
  // Two separate questions, shown separately: is the board reachable (badge +
  // dot), and is it set up (a pot to measure)? Mixing them made an online,
  // unassigned board look like it had a connection problem.
  const status = deviceStatus(device.status);
  const needsPot = device.pots.length === 0;
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
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.pill}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
        <DeviceMenu device={device} onDelete={onDelete} onAssign={onAssign} onAction={onAction} />
      </header>

      {needsPot && !pending ? (
        <div className="mx-4 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="flex items-start gap-1.5">
            <CircleAlert size={14} className="mt-px shrink-0" />
            <span>{"Setup needed — not connected to a pot yet, so its readings aren't saved."}</span>
          </p>
          <button type="button" onClick={onAssign} className="ml-5 mt-1 font-bold hover:underline">
            Connect to a pot →
          </button>
        </div>
      ) : null}

      {pending ? (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
          <Loader2 size={13} className="shrink-0 animate-spin" />
          <span className="min-w-0 flex-1">{pending.doing} — waiting for the board to pick it up…</span>
          <button type="button" onClick={onCancelAction} className="shrink-0 font-semibold hover:underline">
            Cancel
          </button>
        </div>
      ) : null}

      <dl className="space-y-2 px-4 pb-4 text-xs">
        <Row label="Garden">
          {device.gardenId && device.garden ? (
            <Link href={`/gardens/${device.gardenId}`} className="truncate font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              {device.garden.name}
            </Link>
          ) : (
            <button type="button" onClick={onAssign} className="inline-flex items-center gap-1 font-semibold text-amber-600 hover:underline dark:text-amber-400">
              Not in a garden
            </button>
          )}
        </Row>
        <PortList device={device} onAssign={onAssign} onChanged={onChanged} />
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
        <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${status.dot}`} aria-hidden="true" />
        {device.status === "ONLINE" ? "Online — connected to Wi-Fi and reporting to the app." : status.hint}
      </p>
    </article>
  );
}

/** Default wiring per port (firmware SOIL_PINS / RELAY_PINS). */
const PROBE_PINS = [36, 39, 34, 35, 32, 33];
const RELAY_PINS = [5, 18, 19, 21, 22, 23];
const MAX_PORTS = 6;

/**
 * Every port on the board: its soil probe (reading, or "No probe" when nothing
 * valid comes in), its pump relay (on / off) and the pot it serves. Ports can
 * be added / removed here (firmware 2.9+ applies it without re-flashing).
 */
function PortList({ device, onAssign, onChanged }: { device: Device; onAssign: () => void; onChanged: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  // Only trust the last report while the board is reporting.
  const live = device.status === "ONLINE" || device.status === "STALE";
  const report = new Map((device.portStatus ?? []).map((p) => [p.port, p]));
  const inUse = device.pots.length;
  const probes = live ? [...report.values()].filter((p) => p.moisture != null).length : null;
  const remote = supportsRemotePorts(device.firmwareVersion);
  const chip = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold";
  const last = device.portCount;
  const hasPot = (port: number) => device.pots.some((p) => p.port === port);
  // Ports from here to the last one with no pot: they can be removed together.
  let freeFrom = last + 1;
  while (freeFrom > 2 && !hasPot(freeFrom - 1)) freeFrom--;
  // Trailing ports that are completely unused (no pot, no probe reading).
  let unusedFrom = last + 1;
  while (unusedFrom > 2 && !hasPot(unusedFrom - 1) && live && report.get(unusedFrom - 1)?.moisture == null) unusedFrom--;

  async function setPorts(next: number) {
    setBusy(true);
    try {
      await apiPatch(`/api/devices/${device.id}`, { portCount: next });
      toast.success(
        next > device.portCount
          ? `Port ${next} added — wire its probe to GPIO ${PROBE_PINS[next - 1]} and relay to GPIO ${RELAY_PINS[next - 1]}. The board picks it up within 10 s.`
          : next === device.portCount - 1
            ? `Port ${device.portCount} removed.`
            : `Ports ${next + 1}–${device.portCount} removed.`,
      );
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't change the ports."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <dt className="mb-1.5 flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
        <span>
          Ports <span className="text-slate-400">· {device.portCount}</span>
        </span>
        <span className="text-[11px]">
          {probes != null ? `${probes} probe${probes === 1 ? "" : "s"} reading · ` : ""}
          {inUse} of {device.portCount} in use
        </span>
      </dt>
      <dd className="grid gap-1">
        {Array.from({ length: device.portCount }, (_, i) => i + 1).map((port) => {
          const pot = device.pots.find((p) => p.port === port);
          const r = live ? report.get(port) : undefined;
          // Added in the app but the board hasn't reported this port yet.
          const waiting = live && !r && (device.portStatus?.length ?? 0) > 0;
          const pins = `probe → GPIO ${PROBE_PINS[port - 1]} · relay → GPIO ${RELAY_PINS[port - 1]}`;
          return (
            <div key={port} className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-950/60">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-11 shrink-0 text-[11px] font-bold text-slate-600 dark:text-slate-300" title={`Wiring: ${pins}`}>
                  Port {port}
                </span>
                {waiting ? (
                  <span className={`${chip} bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300`}>
                    <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                    Waiting for the board
                  </span>
                ) : (
                  <>
                    <span
                      title={r ? (r.moisture != null ? "Soil probe reading" : "No valid reading — no probe wired, or a loose AO/VCC/GND wire") : "Waiting for the board"}
                      className={`${chip} ${
                        !r
                          ? "bg-slate-100 text-slate-400 dark:bg-slate-800"
                          : r.moisture != null
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                      }`}
                    >
                      <Gauge size={11} aria-hidden="true" />
                      {!r ? "Probe —" : r.moisture != null ? `${Math.round(r.moisture)}%` : "No probe"}
                    </span>
                    <span
                      title="The pump relay's state (the board can't sense whether a pump is wired to it)"
                      className={`${chip} ${
                        r?.pump ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      <Droplets size={11} aria-hidden="true" />
                      {r?.pump == null ? "Pump —" : r.pump ? "Pump on" : "Pump off"}
                    </span>
                  </>
                )}
                <span className="ml-auto flex items-center gap-1">
                  {pot ? (
                    <Link
                      href={potHref(device.gardenId ?? "", pot.id)}
                      title={`Show ${pot.label}`}
                      className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 hover:underline dark:bg-emerald-500/10 dark:text-emerald-300"
                    >
                      {pot.label}
                      <ArrowUpRight size={11} aria-hidden="true" />
                    </Link>
                  ) : (
                    <button type="button" onClick={onAssign} className="text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400">
                      Connect a pot
                    </button>
                  )}
                  <PortMenu
                    device={device}
                    port={port}
                    pot={pot ?? null}
                    removeTo={remote && port > 1 && (port === last || port >= freeFrom) ? last : null}
                    onChanged={onChanged}
                  />
                </span>
              </div>
              {/* Wiring help where something still needs to be connected. */}
              {waiting || (r && r.moisture == null) ? (
                <p className="mt-1 text-[10px] text-slate-400">Wire {pins}</p>
              ) : null}
            </div>
          );
        })}
      </dd>
      {remote && unusedFrom <= last ? (
        <button
          type="button"
          onClick={() => setPorts(unusedFrom - 1)}
          disabled={busy}
          className="mt-1.5 mr-1.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
        >
          <Trash2 size={12} />
          Remove unused port{unusedFrom === last ? ` ${last}` : `s ${unusedFrom}–${last}`}
        </button>
      ) : null}
      {device.portCount < MAX_PORTS ? (
        remote ? (
          <button
            type="button"
            onClick={() => setPorts(device.portCount + 1)}
            disabled={busy}
            className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50/60 disabled:opacity-50 dark:border-slate-700 dark:text-emerald-300 dark:hover:bg-emerald-500/5"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Add port {device.portCount + 1} (probe + pump)
          </button>
        ) : (
          <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
            More ports (up to 6): update the board to firmware 2.9 to add them here — or set{" "}
            <code className="font-semibold">PORT_COUNT</code> in <code>config.h</code> and re-flash.
          </p>
        )
      ) : null}
    </div>
  );
}

interface GardenPot {
  id: string;
  label: string;
  plant: { commonName: string } | null;
  sensors: { id: string; name: string }[];
}

/**
 * One port's ⋮ menu: open / change / disconnect its pot, or remove the port
 * (only the last one — port numbers are tied to the board's pins).
 */
function PortMenu({
  device,
  port,
  pot,
  removeTo,
  onChanged,
}: {
  device: Device;
  port: number;
  pot: { id: string; label: string } | null;
  /** Set when this port (through removeTo, the last one) can be removed. */
  removeTo: number | null;
  onChanged: () => void;
}) {
  const canRemove = removeTo !== null;
  const range = removeTo && removeTo > port ? `ports ${port}–${removeTo}` : `port ${port}`;
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setPicking(false);
  }, []);
  useDismiss(open, close, rootRef, triggerRef);
  const { confirm, toast } = useFeedback();
  const { data: pots } = useSWR<GardenPot[]>(open && picking && device.gardenId ? `/api/pots?gardenId=${device.gardenId}` : null);
  const item =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800";

  async function run(work: () => Promise<string>) {
    close();
    setBusy(true);
    try {
      toast.success(await work());
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update the port."));
    } finally {
      setBusy(false);
    }
  }

  const connect = (target: GardenPot) =>
    run(async () => {
      await apiPatch(`/api/devices/${device.id}`, { ports: [{ port, potId: target.id }] });
      return `${target.label} is now on port ${port}.`;
    });

  async function disconnect() {
    if (!pot) return;
    const ok = await confirm({
      title: `Disconnect ${pot.label} from port ${port}?`,
      message: `${pot.label} stops getting readings and automatic watering until it's connected again. The port stays free for another pot.`,
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    await run(async () => {
      await apiPatch(`/api/devices/${device.id}`, { ports: [{ port, potId: null }] });
      return `${pot.label} disconnected.`;
    });
  }

  async function removePort() {
    const ok = await confirm({
      title: `Remove ${range}?`,
      message: pot
        ? `${pot.label} is disconnected and the board stops using ${range} (pumps switched off). You can add ports again any time.`
        : `The board stops using ${range} (pumps switched off). You can add ports again any time.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    await run(async () => {
      if (pot) await apiPatch(`/api/devices/${device.id}`, { ports: [{ port, potId: null }] });
      await apiPatch(`/api/devices/${device.id}`, { portCount: port - 1 });
      return `${range.charAt(0).toUpperCase()}${range.slice(1)} removed.`;
    });
  }

  // Pots that can go on this port: free ones, or ones on another port of this board (they move).
  const choices = (pots ?? [])
    .filter((p) => p.id !== pot?.id)
    .map((p) => {
      const onThisBoard = device.pots.find((dp) => dp.id === p.id);
      const elsewhere = !onThisBoard && p.sensors.length > 0 ? p.sensors[0].name : null;
      return { pot: p, onThisBoard, elsewhere };
    })
    .sort((a, b) => Number(Boolean(a.elsewhere)) - Number(Boolean(b.elsewhere)) || Number(Boolean(a.onThisBoard)) - Number(Boolean(b.onThisBoard)));

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={busy}
        aria-label={`Port ${port} options`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <EllipsisVertical size={14} />}
      </button>
      {open ? (
        <div role="menu" className="animate-fade-in absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <b className="text-slate-700 dark:text-slate-200">Port {port}</b> · probe GPIO {PROBE_PINS[port - 1]} · relay GPIO {RELAY_PINS[port - 1]}
          </p>
          {picking ? (
            <>
              <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {pot ? "Move another pot here" : "Connect a pot"}
              </p>
              {!device.gardenId ? (
                <p className="px-2.5 py-1.5 text-xs text-slate-500">Put the board in a garden first (⋮ → Move or rename).</p>
              ) : !pots ? (
                <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500">
                  <Loader2 size={12} className="animate-spin" /> Loading pots…
                </p>
              ) : choices.length === 0 ? (
                <p className="px-2.5 py-1.5 text-xs text-slate-500">No other pots in this garden.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto">
                  {choices.map(({ pot: p, onThisBoard, elsewhere }) => (
                    <button
                      key={p.id}
                      role="menuitem"
                      type="button"
                      disabled={Boolean(elsewhere)}
                      onClick={() => connect(p)}
                      className={item}
                      title={elsewhere ? `${p.label} is on ${elsewhere} — disconnect it there first` : undefined}
                    >
                      <Package size={13} className="shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">
                        <b className="font-semibold">{p.label}</b>
                        {p.plant ? <span className="text-slate-400"> · {p.plant.commonName}</span> : null}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {elsewhere ? `on ${elsewhere}` : onThisBoard ? `moves from port ${onThisBoard.port}` : "free"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setPicking(false)} className={`${item} mt-1 text-slate-500`}>
                ← Back
              </button>
            </>
          ) : (
            <>
              {pot ? (
                <Link role="menuitem" href={potHref(device.gardenId ?? "", pot.id)} className={item} onClick={close}>
                  <ArrowUpRight size={13} className="text-slate-400" />
                  Open {pot.label}
                </Link>
              ) : null}
              <button role="menuitem" type="button" onClick={() => setPicking(true)} className={item}>
                <Package size={13} className="text-slate-400" />
                {pot ? "Change pot…" : "Connect a pot…"}
              </button>
              {pot ? (
                <button role="menuitem" type="button" onClick={disconnect} className={item}>
                  <X size={13} className="text-slate-400" />
                  Disconnect {pot.label}
                </button>
              ) : null}
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              {canRemove ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={removePort}
                  className={`${item} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10`}
                >
                  <Trash2 size={13} />
                  Remove {range}
                </button>
              ) : (
                <p className="px-2.5 py-1.5 text-[11px] leading-snug text-slate-400">
                  {port === 1 && device.portCount === 1
                    ? "A board always keeps port 1."
                    : !supportsRemotePorts(device.firmwareVersion)
                      ? "Update the board to firmware 2.9 to remove ports here."
                      : `Ports after this one have pots — remove from the end (port ${device.portCount}) first. Port numbers match the board's pins.`}
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
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

function DeviceMenu({
  device,
  onDelete,
  onAssign,
  onAction,
}: {
  device: Device;
  onDelete: () => void;
  onAssign: () => void;
  onAction: (action: DeviceAction) => void;
}) {
  // The board can only pick up an action while it's checking in.
  const reachable = device.status === "ONLINE" || device.status === "STALE";
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
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Board{reachable ? "" : " · offline — can't reach it"}
          </p>
          {(["RESTART", "RESET_WIFI", "SLEEP", "FACTORY_RESET"] as const).map((action) => {
            const spec = ACTIONS[action];
            const danger = action === "FACTORY_RESET";
            return (
              <button
                key={action}
                role="menuitem"
                type="button"
                disabled={!reachable}
                onClick={() => {
                  setOpen(false);
                  onAction(action);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  danger
                    ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                <spec.icon size={15} className={danger ? "" : "text-slate-400"} />
                {spec.label}
              </button>
            );
          })}
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
            Delete from app
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
  // Multi-pot boards: which pot each port serves ("" = nothing).
  const multiPort = device.portCount > 1;
  const [portPots, setPortPots] = useState<Record<number, string>>(() =>
    Object.fromEntries(Array.from({ length: device.portCount }, (_, i) => [i + 1, device.pots.find((p) => p.port === i + 1)?.id ?? ""])),
  );
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
      const chosen = Object.values(portPots).filter(Boolean);
      if (multiPort && new Set(chosen).size !== chosen.length) throw new Error("A pot can only be on one port.");
      await apiPatch(`/api/devices/${device.id}`, {
        name: name.trim(),
        gardenId: gardenId || null,
        ...(multiPort
          ? { ports: Object.entries(portPots).map(([port, id]) => ({ port: Number(port), potId: gardenId && id ? id : null })) }
          : { potId: gardenId && potId ? potId : null }),
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
            setPortPots((current) => Object.fromEntries(Object.keys(current).map((port) => [port, ""])));
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
      {multiPort ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">Pot on each port</legend>
          <p className="-mt-1 text-xs text-slate-500 dark:text-slate-400">Each port has its own soil probe and pump.</p>
          {Object.keys(portPots).map((key) => {
            const port = Number(key);
            const takenElsewhere = new Set(Object.entries(portPots).filter(([p, id]) => Number(p) !== port && id).map(([, id]) => id));
            return (
              <label key={port} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Port {port}</span>
                <select
                  value={portPots[port]}
                  onChange={(e) => setPortPots((current) => ({ ...current, [port]: e.target.value }))}
                  disabled={!gardenId}
                  className={`${fieldClass} disabled:opacity-50`}
                >
                  <option value="">Nothing connected</option>
                  {(pots ?? []).map((pot) => (
                    <option key={pot.id} value={pot.id} disabled={takenElsewhere.has(pot.id)}>
                      {pot.label}
                      {pot.plant ? ` — ${pot.plant.commonName}` : ""}
                      {takenElsewhere.has(pot.id) ? " (on another port)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </fieldset>
      ) : (
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
      )}
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
