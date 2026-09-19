"use client";

import { useStoredState } from "./use-stored-state";

export type Theme = "system" | "light" | "dark";

/**
 * Tema elegido por el usuario. "system" deja que mande el sistema operativo.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [stored, setStored] = useStoredState<Theme>("nexo-theme", "system");

  function setTheme(next: Theme) {
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    setStored(next === "system" ? null : next);
  }

  return [stored, setTheme];
}
