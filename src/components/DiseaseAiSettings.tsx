"use client";

// Settings → Disease AI: choose what diagnoses leaf photos — the local model
// (free, offline, 14 farm crops) or a free online vision AI (Google Gemini or
// Groq) that knows any plant. Keys are stored encrypted on the server and
// never sent back to the browser.
import { useState } from "react";
import useSWR from "swr";
import { Check, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Microscope, PlugZap, Trash2 } from "lucide-react";
import { apiPost, apiPut } from "@/lib/api-client";
import { errorMessage, useFeedback } from "@/components/Feedback";

type Provider = "LOCAL" | "GEMINI" | "GROQ";
interface AiSettingsView {
  provider: Provider;
  fallbackToLocal: boolean;
  gemini: { key: string | null; model: string };
  groq: { key: string | null; model: string };
}

const OPTIONS: { value: Provider; name: string; tag: string; points: string[] }[] = [
  { value: "LOCAL", name: "Local model", tag: "Free · offline", points: ["Runs on your own AI service", "14 farm crops only (tomato, potato…)", "Basic accuracy"] },
  { value: "GEMINI", name: "Google Gemini", tag: "Free API key", points: ["Any plant, incl. houseplants", "Good with real garden photos", "Explains what it sees"] },
  { value: "GROQ", name: "Groq", tag: "Free API key", points: ["Any plant, very fast", "Llama 4 vision model", "Generous free limit"] },
];

const ONLINE: Record<Exclude<Provider, "LOCAL">, { site: string; url: string; hint: string; models: string[] }> = {
  GEMINI: {
    site: "aistudio.google.com/apikey",
    url: "https://aistudio.google.com/apikey",
    hint: "Starts with AIza…",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
  },
  GROQ: {
    site: "console.groq.com/keys",
    url: "https://console.groq.com/keys",
    hint: "Starts with gsk_…",
    models: ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"],
  },
};

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950";

export function DiseaseAiCard() {
  const { data, mutate } = useSWR<AiSettingsView>("/api/settings/ai");
  return (
    <section id="disease-ai" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Microscope size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Disease AI</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Choose which AI diagnoses your leaf photos.</p>
        </div>
        {data ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Using {OPTIONS.find((o) => o.value === data.provider)?.name}
          </span>
        ) : null}
      </header>
      <div className="p-5">
        {data ? (
          <Editor key={JSON.stringify(data)} saved={data} onSaved={(next) => mutate(next, { revalidate: false })} />
        ) : (
          <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
        )}
      </div>
    </section>
  );
}

function Editor({ saved, onSaved }: { saved: AiSettingsView; onSaved: (next: AiSettingsView) => void }) {
  const { toast } = useFeedback();
  const [provider, setProvider] = useState<Provider>(saved.provider);
  const [keys, setKeys] = useState({ GEMINI: "", GROQ: "" });
  const [models, setModels] = useState({ GEMINI: saved.gemini.model, GROQ: saved.groq.model });
  const [fallback, setFallback] = useState(saved.fallbackToLocal);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [tested, setTested] = useState<{ ok: boolean; text: string } | null>(null);

  const online = provider === "LOCAL" ? null : provider;
  const savedKey = online ? (online === "GEMINI" ? saved.gemini.key : saved.groq.key) : null;
  const savedModel = online ? (online === "GEMINI" ? saved.gemini.model : saved.groq.model) : null;
  const dirty =
    provider !== saved.provider ||
    fallback !== saved.fallbackToLocal ||
    Boolean(online && (keys[online] || models[online] !== savedModel));
  const needsKey = Boolean(online && !savedKey && !keys[online]);

  async function save() {
    setBusy("save");
    try {
      const next = await apiPut<AiSettingsView>("/api/settings/ai", {
        provider,
        fallbackToLocal: fallback,
        ...(online === "GEMINI" ? { geminiModel: models.GEMINI, ...(keys.GEMINI ? { geminiKey: keys.GEMINI } : {}) } : {}),
        ...(online === "GROQ" ? { groqModel: models.GROQ, ...(keys.GROQ ? { groqKey: keys.GROQ } : {}) } : {}),
      });
      toast.success(`Disease AI now uses ${OPTIONS.find((o) => o.value === provider)?.name}.`);
      onSaved(next);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save."));
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (!online) return;
    setBusy("test");
    setTested(null);
    try {
      const result = await apiPost<{ ok: boolean; model: string }>("/api/settings/ai/test", {
        provider: online,
        model: models[online],
        ...(keys[online] ? { apiKey: keys[online] } : {}),
      });
      setTested({ ok: true, text: `Works — ${result.model} answered.` });
    } catch (err) {
      setTested({ ok: false, text: errorMessage(err, "Test failed.") });
    } finally {
      setBusy(null);
    }
  }

  async function removeKey() {
    if (!online) return;
    setBusy("remove");
    try {
      const next = await apiPut<AiSettingsView>("/api/settings/ai", {
        ...(saved.provider === online ? { provider: "LOCAL" } : {}),
        ...(online === "GEMINI" ? { geminiKey: "" } : { groqKey: "" }),
      });
      toast.success("Key removed.");
      onSaved(next);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove the key."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Engine choice */}
      <div role="radiogroup" aria-label="Disease AI engine" className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const checked = provider === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                setProvider(option.value);
                setTested(null);
                setShowKey(false);
              }}
              className={`rounded-xl border p-3 text-left transition ${
                checked
                  ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/40 dark:bg-emerald-500/10"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{option.name}</span>
                {checked ? <Check size={15} className="text-emerald-600 dark:text-emerald-400" /> : null}
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{option.tag}</span>
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {option.points.map((point) => (
                  <li key={point}>· {point}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Online AI: key + model */}
      {online ? (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            <b>1.</b> Get a free key at{" "}
            <a href={ONLINE[online].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              {ONLINE[online].site}
              <ExternalLink size={11} />
            </a>{" "}
            · <b>2.</b> Paste it below · <b>3.</b> Test, then Save.
          </p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
                API key
                {savedKey ? <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Saved {savedKey}</span> : null}
              </span>
              <span className="relative block">
                <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showKey ? "text" : "password"}
                  value={keys[online]}
                  onChange={(e) => {
                    setKeys((k) => ({ ...k, [online]: e.target.value }));
                    setTested(null);
                  }}
                  placeholder={savedKey ? "Paste a new key to replace it" : ONLINE[online].hint}
                  autoComplete="off"
                  spellCheck={false}
                  className={`${input} pl-9 pr-9 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">Model</span>
              <input
                list={`ai-models-${online}`}
                value={models[online]}
                onChange={(e) => {
                  setModels((m) => ({ ...m, [online]: e.target.value }));
                  setTested(null);
                }}
                spellCheck={false}
                className={`${input} font-mono`}
              />
              <datalist id={`ai-models-${online}`}>
                {ONLINE[online].models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={test}
              disabled={busy !== null || needsKey}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {busy === "test" ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
              Test
            </button>
            {tested ? (
              <span className={`text-xs font-semibold ${tested.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>{tested.text}</span>
            ) : null}
            {savedKey ? (
              <button
                type="button"
                onClick={removeKey}
                disabled={busy !== null}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
              >
                <Trash2 size={12} />
                Remove key
              </button>
            ) : null}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
            <span>
              If the online AI fails (no internet, free limit reached), use the local model instead
            </span>
          </label>
          <p className="text-[11px] text-slate-400">
            Your leaf photo and the pot&apos;s plant name are sent to {online === "GEMINI" ? "Google" : "Groq"} for the diagnosis. The key is
            stored encrypted and never shown again.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Uses the AI service on your computer (<code className="rounded bg-slate-100 px-1 font-mono dark:bg-slate-800">services/ai</code>). No account
          needed. It knows 14 farm crops; for houseplants an online AI gives much better results.
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || needsKey || busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Save
        </button>
      </div>
    </div>
  );
}
