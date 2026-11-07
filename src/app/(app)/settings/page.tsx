"use client";

// PAGE: Settings — your profile (name, email) and password. The profile card
// edits in place; the password form shows its rules live and only submits
// when they're all met.
import { useState } from "react";
import useSWR from "swr";
import {
  CalendarDays,
  Check,
  CircleAlert,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Package,
  Pencil,
  Send,
  ShieldCheck,
  Trees,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui";
import { errorMessage, useFeedback } from "@/components/Feedback";
import { apiDelete, apiPatch, apiPost, apiPut } from "@/lib/api-client";
import { timeAgo } from "@/components/device-ui";
import { DiseaseAiCard } from "@/components/DiseaseAiSettings";

interface Profile {
  email: string;
  userName: string | null;
  createdAt: string;
  _count: { gardens: number; pots: number; devices: number };
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default function SettingsPage() {
  const { data, mutate } = useSWR<Profile>("/api/profile");
  const name = data?.userName?.trim() || data?.email.split("@")[0] || "";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Your profile and sign-in details." />

      {/* Identity */}
      <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="h-16 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-sky-500/10 dark:from-emerald-500/20 dark:via-teal-500/10 dark:to-sky-500/5" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 pb-5">
          <span className="-mt-8 grid h-16 w-16 shrink-0 place-items-center self-start rounded-full bg-emerald-600 text-xl font-black text-white ring-4 ring-white dark:ring-slate-900">
            {data ? initials(name) : ""}
          </span>
          <div className="min-w-0 flex-1 pt-2">
            {data ? (
              <>
                <p className="truncate text-lg font-black leading-tight">{name}</p>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">{data.email}</p>
              </>
            ) : (
              <div className="h-10 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            )}
          </div>
          {data ? (
            <div className="flex flex-wrap gap-2 pt-2 text-xs">
              <Chip icon={Trees} text={`${data._count.gardens} ${data._count.gardens === 1 ? "garden" : "gardens"}`} />
              <Chip icon={Package} text={`${data._count.pots} pots`} />
              <Chip icon={Cpu} text={`${data._count.devices} ${data._count.devices === 1 ? "device" : "devices"}`} />
              <Chip icon={CalendarDays} text={`Since ${new Date(data.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`} />
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {data ? <ProfileCard profile={data} onSaved={() => mutate()} /> : <CardSkeleton />}
        <PasswordCard />
      </div>
      <div className="mt-5">
        <TelegramCard />
      </div>
      <div className="mt-5">
        <DiseaseAiCard />
      </div>
    </div>
  );
}

function Chip({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <Icon size={12} />
      {text}
    </span>
  );
}

function Section({ icon: Icon, title, subtitle, action, children }: { icon: LucideIcon; title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ---------- Profile ----------

function ProfileCard({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEditing() {
    setUserName(profile.userName ?? "");
    setEmail(profile.email);
    setError("");
    setEditing(true);
  }

  const emailChanged = email.trim().toLowerCase() !== profile.email;
  const dirty = userName.trim() !== (profile.userName ?? "") || emailChanged;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiPatch("/api/profile", { userName: userName.trim(), email: email.trim() });
      onSaved();
      setEditing(false);
      toast.success(emailChanged ? `Saved — sign in with ${email.trim().toLowerCase()} from now on` : "Profile saved");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your profile."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      icon={User}
      title="Profile"
      subtitle="Your name and the email you sign in with."
      action={
        editing ? null : (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Pencil size={14} />
            Edit
          </button>
        )
      }
    >
      {editing ? (
        <form onSubmit={save} className="space-y-4">
          <Field label="Name" icon={User}>
            <input autoFocus value={userName} onChange={(e) => setUserName(e.target.value)} required maxLength={100} className={`${inputClass} pl-9`} />
          </Field>
          <Field label="Email" icon={Mail} hint={emailChanged ? "You'll use this new email to sign in." : undefined}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={`${inputClass} pl-9`} />
          </Field>
          {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Save
            </button>
          </div>
        </form>
      ) : (
        <dl className="space-y-4">
          <Row icon={User} label="Name" value={profile.userName || "Not set"} />
          <Row icon={Mail} label="Email" value={profile.email} />
        </dl>
      )}
    </Section>
  );
}

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={16} className="shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="truncate font-semibold">{value}</dd>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, hint, children }: { label: string; icon?: LucideIcon; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <span className="relative block">
        {Icon ? <Icon size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /> : null}
        {children}
      </span>
      {hint ? <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">{hint}</span> : null}
    </label>
  );
}

// ---------- Password ----------

const RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "A letter and a number", test: (p) => /[a-z]/i.test(p) && /\d/.test(p) },
];

function strength(password: string) {
  if (!password) return { score: 0, label: "", bar: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-z0-9]/i.test(password)) score++;
  if (score <= 2) return { score: 1, label: "Weak", bar: "bg-rose-500" };
  if (score <= 3) return { score: 2, label: "Okay", bar: "bg-amber-500" };
  return { score: 3, label: "Strong", bar: "bg-emerald-500" };
}

function PasswordCard() {
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rulesMet = RULES.every((rule) => rule.test(next));
  const matches = next.length > 0 && next === confirm;
  const different = next !== current;
  const canSave = Boolean(current) && rulesMet && matches && different && !saving;
  const meter = strength(next);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShow(false);
    setError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await apiPatch("/api/profile", { currentPassword: current, newPassword: next });
      reset();
      setOpen(false);
      toast.success("Password changed — use the new one next time you sign in");
    } catch (err) {
      setError(errorMessage(err, "Couldn't change the password."));
    } finally {
      setSaving(false);
    }
  }

  const type = show ? "text" : "password";

  return (
    <Section icon={ShieldCheck} title="Password" subtitle="Change the password you sign in with.">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <KeyRound size={16} className="text-slate-400" />
            <span className="font-mono tracking-widest">••••••••</span>
          </p>
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(true);
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            Change password
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <Field label="Current password">
            <input autoFocus type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required className={`${inputClass} pr-10`} />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide passwords" : "Show passwords"}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </Field>

          <div>
            <Field label="New password">
              <input type={type} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required className={inputClass} />
            </Field>
            {next ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex flex-1 gap-1" aria-hidden="true">
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= meter.score ? meter.bar : "bg-slate-200 dark:bg-slate-800"}`} />
                  ))}
                </div>
                <span className="w-12 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">{meter.label}</span>
              </div>
            ) : null}
            <ul className="mt-2 space-y-1">
              {[...RULES.map((rule) => ({ label: rule.label, ok: rule.test(next) })), ...(current && next ? [{ label: "Different from the current one", ok: different }] : [])].map((rule) => (
                <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${rule.ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                  {rule.ok ? <Check size={13} /> : <X size={13} />}
                  {rule.label}
                </li>
              ))}
            </ul>
          </div>

          <Field label="Confirm new password">
            <input type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required className={inputClass} />
          </Field>
          {confirm && !matches ? <p className="-mt-2 text-xs font-semibold text-rose-600">Passwords don&apos;t match.</p> : null}

          {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Update password
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}

function CardSkeleton() {
  return <div className="h-56 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />;
}

// ---------- Telegram ----------

interface TelegramStatus {
  configured: boolean;
  source: "app" | "env" | null;
  bot: { username: string; chatName: string | null; chatConnected: boolean; paused?: boolean } | null;
  queue: { pending: number; sent: number; failed: number; expired: number };
  lastSentAt: string | null;
  lastError: { code: string; at: string } | null;
}

const ALERT_TYPES = ["Pump turned on/off", "Pump command failed", "Device offline", "Device back online", "Disease scan result"];

const code = "rounded bg-slate-100 px-1 py-px font-mono text-[12px] dark:bg-slate-800";

function TelegramCard() {
  const { toast, confirm } = useFeedback();
  const { data, mutate } = useSWR<TelegramStatus>("/api/telegram/status", { refreshInterval: 15000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState("");
  const [replacing, setReplacing] = useState(false);

  async function run(kind: string, action: () => Promise<string | void>) {
    setBusy(kind);
    setError("");
    try {
      const message = await action();
      if (message) toast.success(message);
      await mutate();
    } catch (err) {
      setError(errorMessage(err, "Telegram didn't accept that."));
    } finally {
      setBusy(null);
    }
  }

  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    run("connect", async () => {
      const result = await apiPut<{ botUsername: string; chatFound: boolean }>("/api/telegram/settings", { botToken: token.trim() });
      setToken("");
      setReplacing(false);
      return result.chatFound ? `Connected to @${result.botUsername}` : `Bot @${result.botUsername} added — now press Start in Telegram`;
    });
  };
  const detect = () =>
    run("detect", async () => {
      const result = await apiPost<{ chatName: string }>("/api/telegram/settings/detect", {});
      return `Connected to ${result.chatName}`;
    });
  const test = () =>
    run("test", async () => {
      await apiPost("/api/telegram/test", {});
      return "Test message sent — check Telegram";
    });
  const sendNow = () =>
    run("send", async () => {
      const result = await apiPost<{ sent: number }>("/api/telegram/send-now", {});
      return result.sent ? `Sent ${result.sent} queued ${result.sent === 1 ? "alert" : "alerts"}` : "Nothing waiting to send";
    });
  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect Telegram?",
      message: "Alerts stop going to Telegram. Your bot stays saved, so you can reconnect with one click — no need to paste the token again.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (ok) run("disconnect", async () => {
      await apiDelete("/api/telegram/settings");
      return "Telegram disconnected — your bot is saved";
    });
  };
  const reconnect = () =>
    run("reconnect", async () => {
      const result = await apiPatch<{ botUsername: string; chatFound: boolean }>("/api/telegram/settings", {});
      return result.chatFound ? `Reconnected to @${result.botUsername}` : `@${result.botUsername} is back — now press Start in Telegram`;
    });
  const forget = async () => {
    const ok = await confirm({
      title: "Forget this bot?",
      message: "The saved bot token is deleted. To use Telegram again you'll need to paste a token.",
      confirmLabel: "Forget bot",
      tone: "danger",
    });
    if (ok) run("forget", async () => {
      await apiDelete("/api/telegram/settings?forget=1");
      setReplacing(false);
      return "Bot removed";
    });
  };

  const paused = Boolean(data?.bot?.paused) && !replacing;
  const step = !data ? 0 : data.bot?.chatConnected && !replacing ? 3 : data.bot && !replacing ? 2 : 1;
  const usingEnv = data?.source === "env" && !data.bot;

  return (
    <Section
      icon={Send}
      title="Telegram alerts"
      subtitle="Get pump, device and disease alerts on your phone."
      action={
        data ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
              data.configured
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${data.configured ? "bg-emerald-500" : "bg-amber-500"}`} />
            {data.configured ? "Connected" : data.bot?.paused ? "Paused" : "Not connected"}
          </span>
        ) : null
      }
    >
      {!data ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0 space-y-4">
            {/* Progress */}
            {!usingEnv && !paused ? (
              <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                {["Add your bot", "Press Start", "Done"].map((label, i) => {
                  const n = i + 1;
                  const done = step > n || step === 3;
                  const current = step === n && step !== 3;
                  return (
                    <li key={label} className="flex items-center gap-2">
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${
                          done ? "bg-emerald-600 text-white" : current ? "bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                        }`}
                      >
                        {done ? <Check size={13} /> : n}
                      </span>
                      <span className={done || current ? "" : "text-slate-400"}>{label}</span>
                      {n < 3 ? <span className="h-px w-6 bg-slate-200 dark:bg-slate-700" /> : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}

            {paused && data.bot ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-400 text-white dark:bg-slate-600">
                    <Send size={16} />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-bold">@{data.bot.username} · paused</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      Saved{data.bot.chatName ? ` for ${data.bot.chatName}` : ""}. No alerts are sent until you reconnect.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={reconnect}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === "reconnect" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    Reconnect @{data.bot.username}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplacing(true)}
                    disabled={busy !== null}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Use a different bot
                  </button>
                  <button
                    type="button"
                    onClick={forget}
                    disabled={busy !== null}
                    className="ml-auto text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
                  >
                    Forget bot
                  </button>
                </div>
                {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
              </div>
            ) : usingEnv && !replacing ? (
              <div className="rounded-xl bg-slate-50 p-3.5 text-sm dark:bg-slate-950/60">
                Connected through the server&apos;s settings (<code className={code}>.env</code>).{" "}
                <button type="button" onClick={() => setReplacing(true)} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                  Use my own bot instead
                </button>
              </div>
            ) : step === 1 ? (
              <form onSubmit={connect} className="space-y-3">
                <details className="group rounded-xl border border-slate-200 dark:border-slate-800">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                    How do I get a bot token?
                    <span className="text-xs text-slate-400 group-open:hidden">Show steps</span>
                  </summary>
                  <ol className="space-y-1.5 border-t border-slate-100 px-3.5 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    <li>
                      1. In Telegram, open{" "}
                      <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                        @BotFather
                      </a>{" "}
                      and send <code className={code}>/newbot</code>.
                    </li>
                    <li>2. Pick a name, e.g. &ldquo;My Garden Alerts&rdquo;, and a username ending in &ldquo;bot&rdquo;.</li>
                    <li>
                      3. BotFather replies with a token like <code className={code}>123456789:AAH…</code> — copy it and paste it below.
                    </li>
                  </ol>
                </details>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">Bot token</span>
                  <span className="relative block">
                    <KeyRound size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="123456789:AAH…"
                      autoComplete="off"
                      spellCheck={false}
                      className={`${inputClass} pl-9 pr-10 font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      aria-label={showToken ? "Hide token" : "Show token"}
                      className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">Stored encrypted. It&apos;s never shown again or sent to your browser.</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!token.trim() || busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === "connect" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    Connect bot
                  </button>
                  {replacing ? (
                    <button type="button" onClick={() => setReplacing(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            ) : step === 2 && data.bot ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Bot <b>@{data.bot.username}</b> is added. Now open it in Telegram and press <b>Start</b> so it can message you.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`https://t.me/${data.bot.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700"
                  >
                    <Send size={15} />
                    Open @{data.bot.username}
                  </a>
                  <button
                    type="button"
                    onClick={detect}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === "detect" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    I&apos;ve pressed Start
                  </button>
                  <button type="button" onClick={() => setReplacing(true)} disabled={busy !== null} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                    Use a different bot
                  </button>
                </div>
              </div>
            ) : data.bot ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50/70 p-3.5 dark:bg-emerald-500/10">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-500 text-white">
                    <Send size={16} />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-bold">@{data.bot.username}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">Sends alerts to {data.bot.chatName ?? "your chat"}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {data.configured && step !== 1 && step !== 2 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={test}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy === "test" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Send test message
                </button>
                {data.queue.pending ? (
                  <button
                    type="button"
                    onClick={sendNow}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : null}
                    Send {data.queue.pending} queued now
                  </button>
                ) : null}
                {data.bot ? (
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={busy !== null}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="flex items-start gap-1.5 text-sm font-semibold text-rose-600 dark:text-rose-400">
                <CircleAlert size={15} className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : data.lastError ? (
              <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                <CircleAlert size={14} className="mt-px shrink-0" />
                Last problem {timeAgo(data.lastError.at)}: {data.lastError.code}
              </p>
            ) : null}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You&apos;ll get: {ALERT_TYPES.join(" · ")}. Alerts older than 6 hours are skipped so a backlog never floods your chat.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-2 self-start">
            {[
              ["Waiting", data.queue.pending],
              ["Sent", data.queue.sent],
              ["Failed", data.queue.failed],
              ["Skipped (old)", data.queue.expired],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
                <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="text-lg font-black tabular-nums">{value}</dd>
              </div>
            ))}
            <p className="col-span-2 text-[11px] text-slate-400">{data.lastSentAt ? `Last sent ${timeAgo(data.lastSentAt)}` : "Nothing sent yet"}</p>
          </dl>
        </div>
      )}
    </Section>
  );
}
