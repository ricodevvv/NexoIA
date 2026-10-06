"use client";

import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";

type Tone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: Tone };

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Avisos cortos abajo a la derecha que se van solos. Se anuncian a los
 * lectores de pantalla por la región en vivo.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setItems((all) => [...all.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((all) => all.filter((t) => t.id !== id)), 3200);
  }, []);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div key={t.id} className="toast" data-tone={t.tone}>
              <I aria-hidden="true" />
              {t.text}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
