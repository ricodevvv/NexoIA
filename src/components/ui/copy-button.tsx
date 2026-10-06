"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * Botón que copia un texto y muestra una palomita un par de segundos.
 */
export function CopyButton({ text, label = "Copiar", className = "btn btn-sm", showLabel = true }: { text: string; label?: string; className?: string; showLabel?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={showLabel ? undefined : label}
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {showLabel && (copied ? "Copiado" : label)}
    </button>
  );
}
