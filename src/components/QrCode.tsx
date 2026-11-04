"use client";

// Renders text as a scannable QR code (SVG). Always dark-on-white, even in
// dark mode, because phone cameras read that most reliably.
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 144, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      className="overflow-hidden rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
      style={{ width: size, height: size }}
    >
      {svg ? (
        // QRCode.toString returns a self-contained SVG built from `value` only.
        <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />
      )}
    </div>
  );
}
