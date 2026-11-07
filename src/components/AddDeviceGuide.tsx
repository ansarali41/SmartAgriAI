"use client";

// Step-by-step "Add a device" guide: power the board, connect it to Wi-Fi from
// a phone, wait for it to appear, choose its pot, then confirm by pressing the
// board's BOOT button (or typing its pairing code).
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Check, Copy, Cpu, Hand, KeyRound, Loader2, Plug, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { Input } from "@/components/Input";
import { SlideOver } from "@/components/SlideOver";
import { timeAgo } from "@/components/device-ui";
import { QrCode } from "@/components/QrCode";
import { apiPost } from "@/lib/api-client";

export interface GuideGarden {
  id: string;
  name: string;
}

interface FoundBoard {
  hardwareId: string;
  lastSeenAt: string;
  existingName: string | null;
}

type Step = "find" | "claim" | "press" | "done";

const fieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
const primary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50";
const secondary =
  "rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

export function AddDeviceGuide({
  open,
  onClose,
  gardens,
  initialHardwareId,
  initialCode,
  initialGardenId,
  initialPotId,
  onDone,
  onManual,
}: {
  open: boolean;
  onClose: () => void;
  gardens: GuideGarden[];
  /** Jump straight to claiming this board (e.g. from "New devices found"). */
  initialHardwareId?: string | null;
  /** Pre-filled pairing code (from the board's setup-page link). */
  initialCode?: string | null;
  /** Preselect where the device goes (e.g. opened from a pot card). */
  initialGardenId?: string | null;
  initialPotId?: string | null;
  onDone: () => void;
  /** Register by hand with a key (simulator / other firmware). */
  onManual: () => void;
}) {
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Add a device"
      description="Connect a SmartAgri ESP32 in a minute — no cables or codes needed."
    >
      {open ? (
        <GuideSteps
          key={`${initialHardwareId ?? ""}-${initialCode ?? ""}`}
          gardens={gardens}
          initialHardwareId={initialHardwareId ?? null}
          initialCode={initialCode ?? null}
          initialGardenId={initialGardenId ?? null}
          initialPotId={initialPotId ?? null}
          onClose={onClose}
          onDone={onDone}
          onManual={onManual}
        />
      ) : null}
    </SlideOver>
  );
}

function GuideSteps({
  gardens,
  initialHardwareId,
  initialCode,
  initialGardenId,
  initialPotId,
  onClose,
  onDone,
  onManual,
}: {
  gardens: GuideGarden[];
  initialHardwareId: string | null;
  initialCode: string | null;
  initialGardenId: string | null;
  initialPotId: string | null;
  onClose: () => void;
  onDone: () => void;
  onManual: () => void;
}) {
  const [step, setStep] = useState<Step>(initialHardwareId ? "claim" : "find");
  const [board, setBoard] = useState<string | null>(initialHardwareId);
  const [claimedName, setClaimedName] = useState("");

  return (
    <div className="space-y-5">
      <Progress step={step} />

      {step === "find" ? (
        <FindStep
          onPick={(hardwareId) => {
            setBoard(hardwareId);
            setStep("claim");
          }}
          onManual={onManual}
        />
      ) : null}

      {step === "claim" && board ? (
        <ClaimStep
          hardwareId={board}
          gardens={gardens}
          initialCode={initialCode}
          initialGardenId={initialGardenId}
          initialPotId={initialPotId}
          onBack={() => setStep("find")}
          onWaitForButton={(name) => {
            setClaimedName(name);
            setStep("press");
          }}
          onClaimed={(name) => {
            setClaimedName(name);
            setStep("done");
            onDone();
          }}
        />
      ) : null}

      {step === "press" && board ? (
        <PressStep
          hardwareId={board}
          onClaimed={() => {
            setStep("done");
            onDone();
          }}
          onRetry={() => setStep("claim")}
        />
      ) : null}

      {step === "done" ? (
        <div className="flex flex-col items-center rounded-2xl bg-emerald-50 px-4 py-10 text-center dark:bg-emerald-500/10">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-600 text-white">
            <Check size={28} />
          </span>
          <h3 className="mt-4 text-lg font-black">{claimedName || "Your device"} is connected</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-600 dark:text-slate-300">
            It shows as Online within a few seconds and starts updating its pot&apos;s soil moisture.
          </p>
          <button type="button" onClick={onClose} className={`${primary} mt-5`}>
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "find", label: "Connect" },
    { key: "claim", label: "Choose pot" },
    { key: "press", label: "Confirm" },
  ];
  const order: Step[] = ["find", "claim", "press", "done"];
  const current = order.indexOf(step);
  return (
    <ol className="flex items-center gap-2 text-xs font-semibold">
      {steps.map((item, index) => {
        const done = current > index;
        const active = current === index;
        return (
          <li key={item.key} className="flex flex-1 items-center gap-2">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                done ? "bg-emerald-600 text-white" : active ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
              }`}
            >
              {done ? <Check size={13} /> : index + 1}
            </span>
            <span className={active ? "text-slate-900 dark:text-white" : "text-slate-400"}>{item.label}</span>
            {index < steps.length - 1 ? <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function FindStep({ onPick, onManual }: { onPick: (hardwareId: string) => void; onManual: () => void }) {
  const { data: found } = useSWR<FoundBoard[]>("/api/devices/pairing", { refreshInterval: 3000 });
  const { data: info } = useSWR<{ serverUrls: string[] }>("/api/server-info", { revalidateOnFocus: false });
  const serverUrl = info?.serverUrls[0] ?? "";
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(serverUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked
    }
  }

  const hasFound = Boolean(found?.length);

  return (
    <>
      {/* Boards already waiting come first. */}
      <section aria-label="Ready to add">
        <p className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Wifi size={15} className="text-emerald-600 dark:text-emerald-400" />
          {hasFound ? "Ready to add" : "Looking for boards"}
        </p>
          {found?.length ? (
            <ul className="space-y-2">
              {found.map((board) => (
                <li key={board.hardwareId}>
                  <button
                    type="button"
                    onClick={() => onPick(board.hardwareId)}
                    className="flex w-full items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 px-3 py-2.5 text-left transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white">
                      <Cpu size={16} />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate font-mono text-sm font-bold">{board.hardwareId}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        {board.existingName ? `Was “${board.existingName}” · ` : ""}found {timeAgo(board.lastSeenAt)}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Set up →</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <span className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              Looking for boards on your network…
            </span>
          )}
      </section>

      <details open={!hasFound} className="group mt-5 rounded-xl border border-slate-200 dark:border-slate-800">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
          {hasFound ? "Setting up a new board?" : "Set up your board"}
          <span className="text-xs font-semibold text-slate-400 transition group-open:rotate-180">▾</span>
        </summary>
      <ol className="space-y-4 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
        <Instruction icon={Plug} title="Power the board">
          Plug the ESP32 into USB power. Its blue light blinks while it&apos;s waiting to be set up.
        </Instruction>
        <Instruction icon={Smartphone} title="Connect it to Wi-Fi from your phone">
          <QrWalkthrough serverUrl={serverUrl} />
          <span className="mt-3 block text-[11px] text-slate-500 dark:text-slate-400">
            The server address is filled in for you. Typing it instead? It&apos;s
            {serverUrl ? (
              <>
                {" "}
                <code className="rounded bg-slate-100 px-1 font-mono dark:bg-slate-800">{serverUrl}</code>{" "}
                <button type="button" onClick={copy} className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? "copied" : "copy"}
                </button>
              </>
            ) : (
              " loading…"
            )}
            . Already set up? Hold the board&apos;s BOOT button for 3 seconds to change Wi-Fi.
          </span>
        </Instruction>
      </ol>
      </details>
      <p className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Using the simulator or other firmware?{" "}
        <button type="button" onClick={onManual} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
          Register with a key instead
        </button>
      </p>
    </>
  );
}

const SETUP_AP = "SmartAgri-Setup";
// The board's setup page while your phone is on SmartAgri-Setup.
const SETUP_PAGE = "http://192.168.4.1/wifi";

/** One QR at a time: join the board's Wi-Fi, then open its setup page. */
function QrWalkthrough({ serverUrl }: { serverUrl: string }) {
  const [step, setStep] = useState<1 | 2>(1);
  const steps = {
    1: {
      value: `WIFI:T:nopass;S:${SETUP_AP};;`,
      title: "Join the board's Wi-Fi",
      text: (
        <>
          Open your phone&apos;s <b>Camera</b> (or Google Lens), point it at this code and tap the pop-up. Your phone joins{" "}
          <b>{SETUP_AP}</b>.
        </>
      ),
    },
    2: {
      value: serverUrl ? `${SETUP_PAGE}?server=${encodeURIComponent(serverUrl)}` : "",
      title: "Open the setup page",
      text: (
        <>
          Scan again to open the board&apos;s page with this server&apos;s address filled in. Tap <b>Configure WiFi</b>, pick your
          home Wi-Fi, type its password and tap <b>Save</b>.
        </>
      ),
    },
  } as const;
  const current = steps[step];

  return (
    <span className="mt-3 block rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <span className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span>
          Scan {step} of 2
        </span>
        <span className="flex gap-1" aria-hidden="true">
          {[1, 2].map((n) => (
            <span key={n} className={`h-1.5 w-6 rounded-full ${n <= step ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />
          ))}
        </span>
      </span>
      <span className="mt-3 flex flex-col items-center text-center">
        {current.value ? (
          <QrCode key={step} value={current.value} size={176} label={`${current.title} QR code`} />
        ) : (
          <span className="h-44 w-44 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        )}
        <span className="mt-3 block text-sm font-bold text-slate-900 dark:text-white">{current.title}</span>
        <span className="mt-1 block max-w-xs text-xs leading-relaxed text-slate-600 dark:text-slate-300">{current.text}</span>
      </span>
      <span className="mt-4 flex items-center justify-between">
        {step === 2 ? (
          <button type="button" onClick={() => setStep(1)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
            ← Back
          </button>
        ) : (
          <span />
        )}
        {step === 1 ? (
          <button type="button" onClick={() => setStep(2)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
            I&apos;m connected — next
          </button>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">Saved? Your board appears below.</span>
        )}
      </span>
      <span className="mt-4 block rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        <b className="text-slate-800 dark:text-slate-100">Only have your phone?</b> You can&apos;t scan your own screen — skip the codes: open
        your phone&apos;s <b>Wi-Fi settings</b>, join <b>{SETUP_AP}</b>, and the board&apos;s page opens by itself (if not, open{" "}
        <b>192.168.4.1</b> in the browser).
        {serverUrl ? (
          <>
            {" "}
            If the address field is empty, enter <b className="break-all">{serverUrl}</b>.
          </>
        ) : null}
      </span>
    </span>
  );
}

function Instruction({ icon: Icon, title, children }: { icon: typeof Plug; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">{title}</p>
        <div className="mt-0.5 text-slate-600 dark:text-slate-300">{children}</div>
      </div>
    </li>
  );
}

function ClaimStep({
  hardwareId,
  gardens,
  initialCode,
  initialGardenId,
  initialPotId,
  onBack,
  onWaitForButton,
  onClaimed,
}: {
  hardwareId: string;
  gardens: GuideGarden[];
  initialCode: string | null;
  initialGardenId: string | null;
  initialPotId: string | null;
  onBack: () => void;
  onWaitForButton: (name: string) => void;
  onClaimed: (name: string) => void;
}) {
  // Both optional: a board can be added now and placed later.
  const [gardenId, setGardenId] = useState(
    initialGardenId && gardens.some((garden) => garden.id === initialGardenId) ? initialGardenId : "",
  );
  const [potId, setPotId] = useState(initialPotId ?? "");
  // Until the user picks, default to the garden's first pot.
  const [potTouched, setPotTouched] = useState(Boolean(initialPotId));
  const [name, setName] = useState(`ESP32 ${hardwareId.slice(-6)}`);
  const [useCode, setUseCode] = useState(Boolean(initialCode));
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: pots } = useSWR<{ id: string; label: string; plant: { commonName: string } | null }[]>(
    gardenId ? `/api/pots?gardenId=${gardenId}` : null,
  );

  const effectivePotId = !gardenId ? "" : potTouched ? potId : potId || pots?.[0]?.id || "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await apiPost<{ state: string }>("/api/devices/pairing", {
        hardwareId,
        gardenId: gardenId || undefined,
        potId: effectivePotId || undefined,
        name: name.trim(),
        pairingCode: useCode ? code : undefined,
      });
      if (response.state === "claimed") onClaimed(name.trim());
      else onWaitForButton(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set up this device");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-950/60">
        <Cpu size={16} className="text-emerald-600 dark:text-emerald-400" />
        Setting up <b className="font-mono">{hardwareId}</b>
      </p>
      <label className="block">
        <span className="mb-1 flex justify-between text-sm font-bold text-slate-700 dark:text-slate-200">
          Garden <span className="text-xs font-medium text-slate-400">optional</span>
        </span>
        <select value={gardenId} onChange={(e) => { setGardenId(e.target.value); setPotId(""); setPotTouched(false); }} className={fieldClass}>
          <option value="">Choose later</option>
          {gardens.map((garden) => (
            <option key={garden.id} value={garden.id}>
              {garden.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 flex justify-between text-sm font-bold text-slate-700 dark:text-slate-200">
          Pot it measures and waters <span className="text-xs font-medium text-slate-400">optional</span>
        </span>
        <select
          value={effectivePotId}
          onChange={(e) => {
            setPotId(e.target.value);
            setPotTouched(true);
          }}
          disabled={!gardenId}
          className={`${fieldClass} disabled:opacity-50`}
        >
          <option value="">{gardenId ? "Choose later" : "Pick a garden first"}</option>
          {(pots ?? []).map((pot) => (
            <option key={pot.id} value={pot.id}>
              {pot.label}
              {pot.plant ? ` — ${pot.plant.commonName}` : ""}
            </option>
          ))}
        </select>
      </label>
      <Input label="Device name" value={name} onChange={setName} required />
      {!effectivePotId ? (
        <p className="-mt-1 text-xs text-slate-500 dark:text-slate-400">
          You can place it later from Devices → ⋮ → Assign, or a pot&apos;s “Connect a device”. It shows as online meanwhile.
        </p>
      ) : null}

      {useCode ? (
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
            <KeyRound size={14} />
            Pairing code
          </span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            placeholder="123 456"
            maxLength={7}
            required
            className={`${fieldClass} text-center font-mono text-2xl tracking-[0.3em]`}
          />
        </label>
      ) : null}

      {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : null}

      <div className="flex flex-col gap-2 pt-1">
        <button type="submit" disabled={saving} className={primary}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : useCode ? <Check size={16} /> : <Hand size={16} />}
          {useCode ? "Add device" : "Next: press the button on the board"}
        </button>
        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={onBack} className="font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
            ← Back
          </button>
          <button type="button" onClick={() => setUseCode((value) => !value)} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
            {useCode ? "Use the BOOT button instead" : "Use a pairing code instead"}
          </button>
        </div>
      </div>
    </form>
  );
}

function PressStep({ hardwareId, onClaimed, onRetry }: { hardwareId: string; onClaimed: () => void; onRetry: () => void }) {
  const { data } = useSWR<{ state: string; msLeft?: number }>(`/api/devices/pairing?hardwareId=${encodeURIComponent(hardwareId)}`, {
    refreshInterval: 1000,
  });
  const state = data?.state;

  useEffect(() => {
    if (state === "claimed") onClaimed();
  }, [state, onClaimed]);

  const seconds = Math.max(0, Math.round((data?.msLeft ?? 30000) / 1000));
  const expired = state === "available" || state === "not-found";

  return (
    <div className="flex flex-col items-center px-2 py-6 text-center">
      {expired ? (
        <>
          <span className="grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
            <RefreshCw size={28} />
          </span>
          <h3 className="mt-4 text-lg font-black">No button press received</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-600 dark:text-slate-300">
            The board waits 30 seconds. Make sure it&apos;s powered on and connected to Wi-Fi, then try again.
          </p>
          <button type="button" onClick={onRetry} className={`${primary} mt-5`}>
            Try again
          </button>
        </>
      ) : (
        <>
          <div className="relative grid h-28 w-28 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30 motion-reduce:hidden" />
            <span className="relative grid h-24 w-24 place-items-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
              <Hand size={40} />
            </span>
          </div>
          <h3 className="mt-5 text-xl font-black">Press the BOOT button on the board</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-600 dark:text-slate-300">
            It&apos;s the small button labelled <b>BOOT</b> next to the USB port — one short press is enough.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Loader2 size={13} className="animate-spin" />
            Waiting… {seconds}s
          </p>
          <button type="button" onClick={onRetry} className={`${secondary} mt-5`}>
            Back
          </button>
        </>
      )}
    </div>
  );
}
