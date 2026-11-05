"use client";

// App-wide feedback: an in-app confirm dialog (replaces window.confirm) and
// toast notifications. Use via useFeedback():
//   const { confirm, toast } = useFeedback();
//   if (await confirm({ title: "Delete pot?", tone: "danger" })) { ... }
//   toast.success("Saved");
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Tone = "danger" | "default";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface FeedbackApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback() {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return api;
}

/** Error message for a failed request, with a fallback. */
export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

const TOAST_MS = { success: 3500, info: 4000, error: 6000 } as const;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((item) => item.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), TOAST_MS[kind]);
    },
    [dismiss],
  );

  const api = useMemo<FeedbackApi>(
    () => ({
      confirm: (options) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
      toast: {
        success: (message) => push("success", message),
        error: (message) => push("error", message),
        info: (message) => push("info", message),
      },
    }),
    [push],
  );

  function close(ok: boolean) {
    dialog?.resolve(ok);
    setDialog(null);
  }

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {dialog ? <ConfirmDialog options={dialog} onClose={close} /> : null}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const danger = options.tone === "danger";

  useEffect(() => {
    // Safer default for destructive actions: focus Cancel.
    (danger ? cancelRef : confirmRef).current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [danger, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div aria-hidden="true" onClick={() => onClose(false)} className="animate-fade-in absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="animate-fade-in relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
              danger ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
            }`}
          >
            {danger ? <TriangleAlert size={20} /> : <Info size={20} />}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="confirm-title" className="font-bold">
              {options.title}
            </h2>
            {options.message ? <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{options.message}</div> : null}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onClose(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onClose(true)}
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 ${
              danger ? "bg-rose-600 hover:bg-rose-700 focus-visible:outline-rose-600" : "bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600"
            }`}
          >
            {options.confirmLabel ?? (danger ? "Delete" : "Confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const TOAST_STYLE: Record<ToastKind, { icon: typeof CircleCheck; className: string }> = {
  success: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  error: { icon: CircleAlert, className: "text-rose-600 dark:text-rose-400" },
  info: { icon: Info, className: "text-sky-600 dark:text-sky-400" },
};

function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  // Toasts only exist after a user action, i.e. on the client.
  if (!toasts.length) return null;
  return createPortal(
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-20 z-[80] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((item) => {
        const style = TOAST_STYLE[item.kind];
        return (
          <div
            key={item.id}
            role={item.kind === "error" ? "alert" : "status"}
            className="animate-slide-in-right pointer-events-auto flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            <style.icon size={18} className={`mt-0.5 shrink-0 ${style.className}`} />
            <p className="min-w-0 flex-1 text-slate-800 dark:text-slate-100">{item.message}</p>
            <button type="button" onClick={() => onDismiss(item.id)} aria-label="Dismiss" className="-mr-1 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
