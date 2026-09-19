"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "nexo:storage";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

/**
 * Estado guardado en localStorage que se sincroniza entre componentes y
 * pestañas. En el servidor siempre devuelve el valor por defecto.
 */
export function useStoredState<T extends string>(key: string, fallback: T): [T, (value: T | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (read(key) as T | null) ?? fallback,
    () => fallback,
  );

  const set = useCallback(
    (next: T | null) => {
      try {
        if (next === null) localStorage.removeItem(key);
        else localStorage.setItem(key, next);
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set];
}
