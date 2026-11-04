"use client";

// Right-hand panels for growing a garden: add a pot with its plant (both
// required, with soil/watering recommendations), and register a device.
import { useState } from "react";
import useSWR from "swr";
import { Check, Copy, Cpu, Flower2, KeyRound, Leaf, Package, Sprout, Sun, Thermometer } from "lucide-react";
import { Input } from "@/components/Input";
import { SlideOver } from "@/components/SlideOver";
import { DEVICE_TYPE_LABELS } from "@/components/device-ui";
import { apiPatch, apiPost } from "@/lib/api-client";
import {
  PLANT_CATALOG,
  SOIL_LABELS,
  findPlantProfile,
  isSamePlant,
  type PlantProfile,
  type SoilType,
} from "@/lib/plant-catalog";

const GROWTH_STAGES = ["seedling", "vegetative", "flowering", "fruiting", "mature"] as const;

const DEVICE_TYPES = Object.entries(DEVICE_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const fieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
const primaryButton =
  "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60";
const secondaryButton =
  "rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

/** Next free label in the POT-01, POT-02 … series. */
function nextPotLabel(existing: string[]) {
  const taken = new Set(existing.map((label) => label.toUpperCase()));
  for (let n = existing.length + 1; ; n++) {
    const label = `POT-${String(n).padStart(2, "0")}`;
    if (!taken.has(label)) return label;
  }
}

interface PlantingForm {
  plantName: string;
  variety: string;
  growthStage: (typeof GROWTH_STAGES)[number];
  plantedAt: string;
  label: string;
  soilType: SoilType;
  sizeCm: string;
  position: string;
  waterBelow: string;
  stopAt: string;
}

function blankPlanting(existingLabels: string[]): PlantingForm {
  return {
    plantName: "",
    variety: "",
    growthStage: "seedling",
    plantedAt: "",
    label: nextPotLabel(existingLabels),
    soilType: "loam",
    sizeCm: "",
    position: "",
    waterBelow: "30",
    stopAt: "60",
  };
}

export interface GardenDeviceOption {
  id: string;
  name: string;
  status: string;
}

export function AddPlantingPanel({
  open,
  onClose,
  gardenId,
  gardenName,
  existingPotLabels,
  devices,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  gardenId: string;
  gardenName: string;
  existingPotLabels: string[];
  /** Devices already in this garden that the new pot can use. */
  devices: GardenDeviceOption[];
  onCreated: () => void;
}) {
  const [newDevice, setNewDevice] = useState<{ name: string; hardwareId: string; key: string } | null>(null);

  function close() {
    setNewDevice(null);
    onClose();
  }

  return (
    <SlideOver
      open={open}
      onClose={close}
      title={newDevice ? "Pot, plant & device added" : "Add pot & plant"}
      description={
        newDevice
          ? "Copy the device key now — for security it is shown only once."
          : `Every pot in ${gardenName} needs a plant. A sensor is optional.`
      }
      footer={
        newDevice ? (
          <button type="button" onClick={close} className={primaryButton}>
            Done
          </button>
        ) : (
          <>
            <button type="button" onClick={close} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" form="planting-form" className={primaryButton}>
              <Check size={16} />
              Add pot & plant
            </button>
          </>
        )
      }
    >
      {open && newDevice ? (
        <DeviceKey created={newDevice} />
      ) : open ? (
        // Remount on each open so the form starts fresh with a new label.
        <PlantingFields
          gardenId={gardenId}
          existingPotLabels={existingPotLabels}
          devices={devices}
          onCreated={(device) => {
            onCreated();
            if (device) setNewDevice(device);
            else close();
          }}
        />
      ) : null}
    </SlideOver>
  );
}

type DeviceChoice = "none" | "existing" | "new";

function PlantingFields({
  gardenId,
  existingPotLabels,
  devices,
  onCreated,
}: {
  gardenId: string;
  existingPotLabels: string[];
  devices: GardenDeviceOption[];
  onCreated: (newDevice: { name: string; hardwareId: string; key: string } | null) => void;
}) {
  const [form, setForm] = useState<PlantingForm>(() => blankPlanting(existingPotLabels));
  const [deviceChoice, setDeviceChoice] = useState<DeviceChoice>("none");
  const [existingDeviceId, setExistingDeviceId] = useState(devices[0]?.id ?? "");
  const [newDevice, setNewDevice] = useState({ name: "", hardwareId: "", type: "esp32_node" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: plants } = useSWR<{ commonName: string; gardenId: string }[]>("/api/plants");

  const profile = findPlantProfile(form.plantName);
  const name = form.plantName.trim();
  const sameKind = name ? (plants ?? []).filter((plant) => isSamePlant(plant.commonName, name)) : [];
  const inThisGarden = sameKind.filter((plant) => plant.gardenId === gardenId).length;
  const set = <K extends keyof PlantingForm>(key: K, value: PlantingForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  function choosePlant(value: string) {
    const next = findPlantProfile(value);
    setForm((f) => {
      const previous = findPlantProfile(f.plantName);
      // Apply the recommendation when the plant changes to a known one; keep
      // the user's own choices while they're still typing the same plant.
      if (next && next !== previous) {
        return {
          ...f,
          plantName: value,
          soilType: next.soil,
          waterBelow: String(next.moisture[0]),
          stopAt: String(next.moisture[1]),
        };
      }
      return { ...f, plantName: value };
    });
  }

  function applyRecommendation(plant: PlantProfile) {
    setForm((f) => ({
      ...f,
      soilType: plant.soil,
      waterBelow: String(plant.moisture[0]),
      stopAt: String(plant.moisture[1]),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const waterBelow = Number(form.waterBelow);
    const stopAt = Number(form.stopAt);
    if (!(waterBelow < stopAt)) {
      setError("“Start watering below” must be lower than “Stop watering at”.");
      return;
    }
    setSaving(true);
    try {
      const device =
        deviceChoice === "existing" && existingDeviceId
          ? { mode: "existing", deviceId: existingDeviceId }
          : deviceChoice === "new"
            ? { mode: "new", name: newDevice.name.trim(), hardwareId: newDevice.hardwareId.trim(), type: newDevice.type }
            : undefined;
      const result = await apiPost<{
        device: { name: string; hardwareId: string } | null;
        deviceKey: string | null;
      }>(`/api/gardens/${gardenId}/plantings`, {
        device,
        plant: {
          commonName: name,
          variety: form.variety.trim() || undefined,
          growthStage: form.growthStage,
          plantedAt: form.plantedAt ? new Date(form.plantedAt).toISOString() : undefined,
        },
        pot: {
          label: form.label.trim(),
          soilType: form.soilType,
          sizeCm: form.sizeCm ? Number(form.sizeCm) : undefined,
          position: form.position.trim() || undefined,
          moistureOnThreshold: waterBelow,
          moistureOffThreshold: stopAt,
        },
      });
      onCreated(
        result.deviceKey && result.device
          ? { name: result.device.name, hardwareId: result.device.hardwareId, key: result.deviceKey }
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add pot and plant");
    } finally {
      setSaving(false);
    }
  }

  const soilMatches = profile && form.soilType === profile.soil;

  return (
    <form id="planting-form" onSubmit={submit} className="space-y-5" aria-busy={saving}>
      {/* 1. Plant */}
      <section className="space-y-4" aria-label="Plant">
        <StepHeading step={1} icon={Flower2} title="Plant" />
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Plant name</span>
          <input
            list="plant-catalog"
            value={form.plantName}
            onChange={(e) => choosePlant(e.target.value)}
            placeholder="Start typing, e.g. Tomato or Brinjal"
            required
            autoComplete="off"
            className={fieldClass}
          />
          <datalist id="plant-catalog">
            {PLANT_CATALOG.map((plant) => (
              <option key={plant.name} value={plant.name}>
                {plant.aliases?.join(", ")}
              </option>
            ))}
          </datalist>
        </label>

        {name ? (
          <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
            <Sprout size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
            {plants == null ? (
              "Checking your plants…"
            ) : sameKind.length === 0 ? (
              <>This will be your first <b className="font-semibold">{profile?.name ?? name}</b>.</>
            ) : (
              <>
                You already grow <b className="font-semibold">{inThisGarden}</b> {profile?.name ?? name} in this garden
                {sameKind.length !== inThisGarden ? (
                  <>
                    {" "}· <b className="font-semibold">{sameKind.length}</b> across all gardens
                  </>
                ) : null}
                .
              </>
            )}
            </span>
          </p>
        ) : null}

        {profile ? (
          <Recommendation profile={profile} onApply={() => applyRecommendation(profile)} applied={!!soilMatches} />
        ) : name ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No growing guide for “{name}” yet — choose the soil and watering levels yourself below.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Variety (optional)" value={form.variety} onChange={(v) => set("variety", v)} placeholder="e.g. Cherry" />
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Growth stage</span>
            <select
              value={form.growthStage}
              onChange={(e) => set("growthStage", e.target.value as PlantingForm["growthStage"])}
              className={fieldClass}
            >
              {GROWTH_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage.charAt(0).toUpperCase() + stage.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input label="Planted on (optional)" value={form.plantedAt} onChange={(v) => set("plantedAt", v)} type="date" />
      </section>

      {/* 2. Pot */}
      <section className="space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800" aria-label="Pot">
        <StepHeading step={2} icon={Package} title="Pot" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Pot label" value={form.label} onChange={(v) => set("label", v)} required />
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-200">
              Soil
              {soilMatches ? (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Recommended
                </span>
              ) : null}
            </span>
            <select value={form.soilType} onChange={(e) => set("soilType", e.target.value as SoilType)} className={fieldClass}>
              {(Object.keys(SOIL_LABELS) as SoilType[]).map((soil) => (
                <option key={soil} value={soil}>
                  {SOIL_LABELS[soil]}
                  {profile?.soil === soil ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start watering below (%)"
            value={form.waterBelow}
            onChange={(v) => set("waterBelow", v)}
            type="number"
            step="1"
            required
          />
          <Input
            label="Stop watering at (%)"
            value={form.stopAt}
            onChange={(v) => set("stopAt", v)}
            type="number"
            step="1"
            required
          />
        </div>
        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
          Automatic watering keeps soil moisture between these two levels.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Pot size, cm (optional)" value={form.sizeCm} onChange={(v) => set("sizeCm", v)} type="number" step="any" />
          <Input label="Position (optional)" value={form.position} onChange={(v) => set("position", v)} placeholder="e.g. Balcony, left" />
        </div>
      </section>

      {/* 3. Device (optional) */}
      <section className="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800" aria-label="Device">
        <StepHeading step={3} icon={Cpu} title="Sensor device" optional />
        <p className="-mt-1 text-xs text-slate-500 dark:text-slate-400">
          A connected sensor keeps this pot&apos;s soil moisture up to date and drives automatic watering.
        </p>
        <div role="radiogroup" aria-label="Sensor device" className="grid gap-2">
          <ChoiceCard checked={deviceChoice === "none"} onSelect={() => setDeviceChoice("none")} title="Skip for now" hint="Connect a sensor later from the pot card." />
          <ChoiceCard
            checked={deviceChoice === "existing"}
            onSelect={() => setDeviceChoice("existing")}
            disabled={devices.length === 0}
            title="Use a device in this garden"
            hint={devices.length ? `${devices.length} available` : "No devices in this garden yet"}
          />
          <ChoiceCard checked={deviceChoice === "new"} onSelect={() => setDeviceChoice("new")} title="Register a new device" hint="You'll get its key after saving." />
        </div>

        {deviceChoice === "existing" && devices.length ? (
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Device</span>
            <select value={existingDeviceId} onChange={(e) => setExistingDeviceId(e.target.value)} className={fieldClass} required>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} — {statusLabel(device.status)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {deviceChoice === "new" ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Device name" value={newDevice.name} onChange={(v) => setNewDevice((d) => ({ ...d, name: v }))} placeholder="e.g. Pot 4 sensor" required />
              <Input label="Hardware ID" value={newDevice.hardwareId} onChange={(v) => setNewDevice((d) => ({ ...d, hardwareId: v }))} placeholder="e.g. ESP32-GARDEN-03" required />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Type</span>
              <select value={newDevice.type} onChange={(e) => setNewDevice((d) => ({ ...d, type: e.target.value }))} className={fieldClass}>
                {DEVICE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>

      {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}
      {saving ? <p className="text-sm text-slate-500">Saving…</p> : null}
    </form>
  );
}

function statusLabel(status: string) {
  return status === "ONLINE" ? "online" : status === "STALE" ? "delayed" : status === "OFFLINE" ? "offline" : "not connected yet";
}

function ChoiceCard({
  checked,
  onSelect,
  title,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-emerald-500 bg-emerald-50/60 dark:border-emerald-500/60 dark:bg-emerald-500/10"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
          checked ? "border-emerald-600 dark:border-emerald-400" : "border-slate-300 dark:border-slate-600"
        }`}
      >
        {checked ? <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </button>
  );
}

function StepHeading({
  step,
  icon: Icon,
  title,
  optional = false,
}: {
  step: number;
  icon: typeof Flower2;
  title: string;
  optional?: boolean;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-bold">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-xs text-white">{step}</span>
      <Icon size={15} className="text-slate-400" />
      {title}
      {optional ? (
        <span className="text-xs font-medium text-slate-400">optional</span>
      ) : (
        <span className="text-xs font-medium text-rose-500">required</span>
      )}
    </h3>
  );
}

function Recommendation({ profile, onApply, applied }: { profile: PlantProfile; onApply: () => void; applied: boolean }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800 dark:text-emerald-200">
            <Leaf size={15} />
            Recommended for {profile.name}
          </p>
          <p className="mt-0.5 text-[11px] italic text-emerald-700/70 dark:text-emerald-300/60">{profile.scientificName}</p>
        </div>
        {applied ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <Check size={13} />
            Applied
          </span>
        ) : (
          <button
            type="button"
            onClick={onApply}
            className="shrink-0 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Use these
          </button>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
        <Fact label="Soil" value={`${SOIL_LABELS[profile.soil]} — ${profile.soilNote}`} wide />
        <Fact label="Soil pH" value={`${profile.ph[0].toFixed(1)}–${profile.ph[1].toFixed(1)}`} />
        <Fact label="Soil moisture" value={`${profile.moisture[0]}–${profile.moisture[1]}%`} />
        <Fact label="Temperature" value={`${profile.tempC[0]}–${profile.tempC[1]} °C`} icon={Thermometer} />
        <Fact label="Sunlight" value={profile.sunlight} icon={Sun} />
      </dl>
      <p className="mt-3 border-t border-emerald-200/70 pt-2.5 text-xs text-emerald-900 dark:border-emerald-500/20 dark:text-emerald-100">
        💡 {profile.tip}
      </p>
    </div>
  );
}

function Fact({ label, value, wide, icon: Icon }: { label: string; value: string; wide?: boolean; icon?: typeof Sun }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="flex items-center gap-1 font-semibold uppercase tracking-wide text-emerald-700/70 dark:text-emerald-300/60">
        {Icon ? <Icon size={11} /> : null}
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}

export function AddDevicePanel({
  open,
  onClose,
  gardenId,
  pot,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  gardenId: string;
  /** The pot this device will be connected to. */
  pot: { id: string; label: string } | null;
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
      title={created ? "Device added" : `Add device to ${pot?.label ?? "pot"}`}
      description={
        created
          ? "Copy the device key now — for security it is shown only once."
          : `Its soil-moisture readings will update ${pot?.label ?? "this pot"} automatically.`
      }
      footer={
        created ? (
          <button type="button" onClick={close} className={primaryButton}>
            Done
          </button>
        ) : (
          <>
            <button type="button" onClick={close} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" form="device-form" className={primaryButton}>
              <Check size={16} />
              Add device
            </button>
          </>
        )
      }
    >
      {open && created ? (
        <DeviceKey created={created} />
      ) : open && pot ? (
        <DeviceFields
          gardenId={gardenId}
          potId={pot.id}
          onCreated={(result) => {
            setCreated(result);
            onCreated();
          }}
        />
      ) : null}
    </SlideOver>
  );
}

function DeviceFields({
  gardenId,
  potId,
  onCreated,
}: {
  gardenId: string;
  potId: string;
  onCreated: (result: { name: string; hardwareId: string; key: string }) => void;
}) {
  const [name, setName] = useState("");
  const [hardwareId, setHardwareId] = useState("");
  const [type, setType] = useState("esp32_node");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await apiPost<{ device: { name: string; hardwareId: string }; deviceKey: string }>("/api/devices", {
        gardenId,
        potId,
        name: name.trim(),
        hardwareId: hardwareId.trim(),
        type,
      });
      onCreated({ name: result.device.name, hardwareId: result.device.hardwareId, key: result.deviceKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add device");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="device-form" onSubmit={submit} className="space-y-4" aria-busy={saving}>
      <Input label="Device name" value={name} onChange={setName} placeholder="e.g. Balcony node" required />
      <div>
        <Input label="Hardware ID" value={hardwareId} onChange={setHardwareId} placeholder="e.g. ESP32-GARDEN-03" required />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          The ID set in the device firmware. It must be unique across all your devices.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Type</span>
        <select value={type} onChange={(e) => setType(e.target.value)} className={fieldClass}>
          {DEVICE_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}
      {saving ? <p className="text-sm text-slate-500">Saving…</p> : null}
    </form>
  );
}

export function DeviceKey({ created }: { created: { name: string; hardwareId: string; key: string } }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
        <Check size={16} />
        {created.name} ({created.hardwareId}) is registered.
      </p>
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <KeyRound size={15} className="text-amber-500" />
          Device key
        </p>
        <div className="flex gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950">
            {created.key}
          </code>
          <button type="button" onClick={copy} className={`${secondaryButton} inline-flex shrink-0 items-center gap-1.5 self-start`}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Save this key now. It won&apos;t be shown again — only a secure hash is stored.
        </p>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
        <p className="font-semibold">Next steps</p>
        <ol className="mt-1 list-decimal space-y-1 pl-4">
          <li>For the simulator, use these as <code>DEVICE_ID</code> / <code>DEVICE_KEY</code>. SmartAgri ESP32 boards don&apos;t need this — they get their key automatically when claimed on the Sensors page.</li>
          <li>Power it on — it shows as Online once its first reading arrives.</li>
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit an existing pot and its plant
// ---------------------------------------------------------------------------

const HEALTH_OPTIONS = ["healthy", "at_risk", "diseased", "recovering", "unknown"] as const;
const EDIT_STAGES = ["seedling", "vegetative", "flowering", "fruiting", "mature", "harvested"] as const;

export interface EditablePot {
  id: string;
  label: string;
  soilType: SoilType;
  moistureOnThreshold: number;
  moistureOffThreshold: number;
  plant: { id: string; commonName: string } | null;
}

interface PotDetails {
  id: string;
  sizeCm: number | null;
  position: string | null;
}
interface PlantDetails {
  id: string;
  potId: string;
  commonName: string;
  variety: string | null;
  growthStage: (typeof EDIT_STAGES)[number];
  healthStatus: (typeof HEALTH_OPTIONS)[number];
}

export function EditPotPanel({
  open,
  onClose,
  gardenId,
  pot,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  gardenId: string;
  pot: EditablePot | null;
  onSaved: () => void;
}) {
  const { data: pots } = useSWR<PotDetails[]>(open ? `/api/pots?gardenId=${gardenId}` : null);
  const { data: plants } = useSWR<PlantDetails[]>(open ? `/api/plants?gardenId=${gardenId}` : null);
  const details = pots?.find((item) => item.id === pot?.id);
  const plant = plants?.find((item) => item.potId === pot?.id) ?? null;
  const ready = Boolean(pot && pots && plants);

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={`Edit ${pot?.label ?? "pot"}`}
      description="Change the plant, the pot and when it gets watered."
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" form="edit-pot-form" disabled={!ready} className={primaryButton}>
            <Check size={16} />
            Save changes
          </button>
        </>
      }
    >
      {open && pot && ready ? (
        <EditPotFields
          key={pot.id}
          pot={pot}
          details={details ?? { id: pot.id, sizeCm: null, position: null }}
          plant={plant}
          gardenId={gardenId}
          onSaved={() => {
            onSaved();
            onClose();
          }}
        />
      ) : open ? (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : null}
    </SlideOver>
  );
}

function EditPotFields({
  pot,
  details,
  plant,
  gardenId,
  onSaved,
}: {
  pot: EditablePot;
  details: PotDetails;
  plant: PlantDetails | null;
  gardenId: string;
  onSaved: () => void;
}) {
  const initial = {
    plantName: plant?.commonName ?? "",
    variety: plant?.variety ?? "",
    growthStage: plant?.growthStage ?? "seedling",
    healthStatus: plant?.healthStatus ?? "unknown",
    label: pot.label,
    soilType: pot.soilType,
    sizeCm: details.sizeCm != null ? String(details.sizeCm) : "",
    position: details.position ?? "",
    waterBelow: String(pot.moistureOnThreshold),
    stopAt: String(pot.moistureOffThreshold),
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const profile = findPlantProfile(form.plantName);
  const recommendationApplied =
    profile &&
    form.soilType === profile.soil &&
    form.waterBelow === String(profile.moisture[0]) &&
    form.stopAt === String(profile.moisture[1]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const waterBelow = Number(form.waterBelow);
    const stopAt = Number(form.stopAt);
    if (!(waterBelow < stopAt)) {
      setError("“Start watering below” must be lower than “Stop watering at”.");
      return;
    }
    if (!form.plantName.trim()) {
      setError("Every pot needs a plant.");
      return;
    }
    setSaving(true);
    try {
      // Pot details
      const potChanges: Record<string, unknown> = {};
      if (form.label.trim() !== initial.label) potChanges.label = form.label.trim();
      if (form.soilType !== initial.soilType) potChanges.soilType = form.soilType;
      if (form.sizeCm !== initial.sizeCm) potChanges.sizeCm = form.sizeCm ? Number(form.sizeCm) : null;
      if (form.position.trim() !== initial.position) potChanges.position = form.position.trim() || null;
      if (Object.keys(potChanges).length) await apiPatch(`/api/pots/${pot.id}`, potChanges);

      // Watering levels (this also re-evaluates automatic watering)
      if (form.waterBelow !== initial.waterBelow || form.stopAt !== initial.stopAt) {
        await apiPatch(`/api/pots/${pot.id}/irrigation`, { moistureOnThreshold: waterBelow, moistureOffThreshold: stopAt });
      }

      // Plant
      const plantFields = {
        commonName: profile?.name ?? form.plantName.trim(),
        variety: form.variety.trim(),
        growthStage: form.growthStage,
        healthStatus: form.healthStatus,
      };
      if (plant) {
        const changed =
          plantFields.commonName !== initial.plantName ||
          plantFields.variety !== initial.variety ||
          plantFields.growthStage !== initial.growthStage ||
          plantFields.healthStatus !== initial.healthStatus;
        if (changed) await apiPatch(`/api/plants/${plant.id}`, plantFields);
      } else {
        await apiPost("/api/plants", {
          gardenId,
          potId: pot.id,
          commonName: plantFields.commonName,
          variety: plantFields.variety || undefined,
          growthStage: plantFields.growthStage,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="edit-pot-form" onSubmit={submit} className="space-y-5" aria-busy={saving}>
      <section className="space-y-4" aria-label="Plant">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Flower2 size={15} className="text-slate-400" />
          Plant
        </h3>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Plant name</span>
          <input
            list="plant-catalog-edit"
            value={form.plantName}
            onChange={(e) => set("plantName", e.target.value)}
            required
            autoComplete="off"
            className={fieldClass}
          />
          <datalist id="plant-catalog-edit">
            {PLANT_CATALOG.map((item) => (
              <option key={item.name} value={item.name}>
                {item.aliases?.join(", ")}
              </option>
            ))}
          </datalist>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Variety" value={form.variety} onChange={(v) => set("variety", v)} placeholder="optional" />
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Growth stage</span>
            <select value={form.growthStage} onChange={(e) => set("growthStage", e.target.value as typeof form.growthStage)} className={fieldClass}>
              {EDIT_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage.charAt(0).toUpperCase() + stage.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Health</span>
          <select value={form.healthStatus} onChange={(e) => set("healthStatus", e.target.value as typeof form.healthStatus)} className={fieldClass}>
            {HEALTH_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === "at_risk" ? "At risk" : status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </label>
        {profile && !recommendationApplied ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-xs dark:border-emerald-500/25 dark:bg-emerald-500/5">
            <span className="text-emerald-900 dark:text-emerald-100">
              <Leaf size={13} className="mr-1 inline" />
              {profile.name} prefers {SOIL_LABELS[profile.soil].toLowerCase()} soil and {profile.moisture[0]}–{profile.moisture[1]}% moisture.
            </span>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  soilType: profile.soil,
                  waterBelow: String(profile.moisture[0]),
                  stopAt: String(profile.moisture[1]),
                }))
              }
              className="shrink-0 rounded-md bg-emerald-600 px-2 py-1 font-semibold text-white hover:bg-emerald-700"
            >
              Use these
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800" aria-label="Pot">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Package size={15} className="text-slate-400" />
          Pot
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Pot label" value={form.label} onChange={(v) => set("label", v)} required />
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">Soil</span>
            <select value={form.soilType} onChange={(e) => set("soilType", e.target.value as SoilType)} className={fieldClass}>
              {(Object.keys(SOIL_LABELS) as SoilType[]).map((soil) => (
                <option key={soil} value={soil}>
                  {SOIL_LABELS[soil]}
                  {profile?.soil === soil ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Pot size, cm" value={form.sizeCm} onChange={(v) => set("sizeCm", v)} type="number" step="any" />
          <Input label="Position" value={form.position} onChange={(v) => set("position", v)} placeholder="e.g. Balcony, left" />
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800" aria-label="Watering">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Sprout size={15} className="text-slate-400" />
          Watering
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start watering below (%)" value={form.waterBelow} onChange={(v) => set("waterBelow", v)} type="number" step="1" required />
          <Input label="Stop watering at (%)" value={form.stopAt} onChange={(v) => set("stopAt", v)} type="number" step="1" required />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Automatic watering keeps soil moisture between these levels.</p>
      </section>

      {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}
      {saving ? <p className="text-sm text-slate-500">Saving…</p> : null}
    </form>
  );
}
