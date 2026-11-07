"use client";

// A thumbnail that opens the full image over the page, with zoom:
// buttons (− / + / fit), mouse wheel, double-click, pinch on touch screens,
// and drag to move around when zoomed in. Closes with Esc, ✕ or a click on
// the dark background.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Maximize2, Minus, Plus, ScanSearch, X } from "lucide-react";

const MIN = 1;
const MAX = 6;
const STEP = 1.4;

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: 1, x: 0, y: 0 };
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

export function ImageLightbox({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View full image: ${alt}`}
        className={`group relative shrink-0 overflow-hidden rounded-xl bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-slate-800 ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
        <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white opacity-80 transition group-hover:opacity-100">
          <Maximize2 size={14} />
        </span>
      </button>
      {open ? createPortal(<Viewer src={src} alt={alt} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

function Viewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [view, setView] = useState<View>(FIT);
  // While a finger / mouse is down the image follows it directly (no easing).
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  // Active pointers (mouse / fingers) for dragging and pinching.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const moved = useRef(false);

  /** Zoom to `scale`, keeping the point (cx, cy) — relative to the stage centre — still. */
  const zoomTo = useCallback((scale: number, cx = 0, cy = 0) => {
    setView((v) => {
      const next = clamp(scale, MIN, MAX);
      if (next === MIN) return FIT;
      const k = next / v.scale;
      return { scale: next, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  const zoomBy = useCallback((factor: number, cx = 0, cy = 0) => {
    setView((v) => {
      const next = clamp(v.scale * factor, MIN, MAX);
      if (next === MIN) return FIT;
      const k = next / v.scale;
      return { scale: next, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  // Keyboard: Esc closes, + / − zoom, 0 fits. The page behind doesn't scroll.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "+" || event.key === "=") zoomBy(STEP);
      else if (event.key === "-" || event.key === "_") zoomBy(1 / STEP);
      else if (event.key === "0") setView(FIT);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, zoomBy]);

  // Wheel / trackpad zoom around the pointer (non-passive so the page doesn't scroll).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const cx = event.clientX - rect.left - rect.width / 2;
      const cy = event.clientY - rect.top - rect.height / 2;
      zoomBy(Math.exp(-event.deltaY * 0.002), cx, cy);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const center = (event: { clientX: number; clientY: number }) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { cx: event.clientX - rect.left - rect.width / 2, cy: event.clientY - rect.top - rect.height / 2 };
  };

  function onPointerDown(event: React.PointerEvent) {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    setDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = center({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      zoomTo((pinch.current.scale * distance) / pinch.current.distance, mid.cx, mid.cy);
      moved.current = true;
    } else if (pointers.current.size === 1 && view.scale > 1) {
      const dx = now.x - last.x;
      const dy = now.y - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) moved.current = true;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  }

  function onDoubleClick(event: React.MouseEvent) {
    const { cx, cy } = center(event);
    if (view.scale > 1) setView(FIT);
    else zoomTo(2.5, cx, cy);
  }

  const percent = Math.round(view.scale * 100);
  const control =
    "grid h-9 w-9 place-items-center rounded-lg text-white hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div role="dialog" aria-modal="true" aria-label={alt} className="animate-fade-in fixed inset-0 z-[200] bg-black/90">
      {/* Stage: the image, zoomed and moved with a CSS transform. */}
      <div
        ref={stageRef}
        // A click on the dark background (not after a drag) closes.
        onClick={(event) => {
          if (event.target === event.currentTarget && !moved.current) onClose();
        }}
        className="absolute inset-0 flex touch-none select-none items-center justify-center overflow-hidden p-4 sm:p-12"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: dragging ? "none" : "transform 120ms ease-out",
          }}
          className={`max-h-full max-w-full rounded-lg object-contain shadow-2xl ${view.scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        />
      </div>

      {/* Top right: original + close */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
        >
          <ExternalLink size={15} />
          Original
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          autoFocus
          className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/20"
        >
          <X size={18} />
        </button>
      </div>

      {/* Bottom: zoom controls */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-white/10 p-1 backdrop-blur">
        <button type="button" onClick={() => zoomBy(1 / STEP)} disabled={view.scale <= MIN} aria-label="Zoom out" className={control}>
          <Minus size={18} />
        </button>
        <button
          type="button"
          onClick={() => setView(FIT)}
          aria-label="Fit to screen"
          title="Fit to screen (0)"
          className="min-w-16 rounded-lg px-2 py-2 text-sm font-bold tabular-nums text-white hover:bg-white/15"
        >
          {percent}%
        </button>
        <button type="button" onClick={() => zoomBy(STEP)} disabled={view.scale >= MAX} aria-label="Zoom in" className={control}>
          <Plus size={18} />
        </button>
        <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
        <button type="button" onClick={() => setView(FIT)} disabled={view.scale === 1} aria-label="Fit to screen" title="Fit to screen" className={control}>
          <ScanSearch size={18} />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-[4.5rem] left-1/2 hidden -translate-x-1/2 text-xs text-white/50 sm:block">
        Scroll or double-click to zoom · drag to move
      </p>
    </div>
  );
}
