"use client";

import { useStoredState } from "./use-stored-state";

export type FontSize = "sm" | "md" | "lg";
export type ChatWidth = "normal" | "wide";

/**
 * Tamaño de letra de toda la app. Se aplica como `data-font` en `<html>` y el
 * script del layout lo repone antes de pintar para que no parpadee.
 */
export function useFontSize(): [FontSize, (v: FontSize) => void] {
  const [value, setStored] = useStoredState<FontSize>("nexo-font", "md");
  return [
    value,
    (next) => {
      if (next === "md") delete document.documentElement.dataset.font;
      else document.documentElement.dataset.font = next;
      setStored(next === "md" ? null : next);
    },
  ];
}

/**
 * Ancho de la columna del chat: normal o amplio para pantallas grandes.
 */
export function useChatWidth(): [ChatWidth, (v: ChatWidth) => void] {
  const [value, setStored] = useStoredState<ChatWidth>("nexo-width", "normal");
  return [
    value,
    (next) => {
      if (next === "normal") delete document.documentElement.dataset.width;
      else document.documentElement.dataset.width = next;
      setStored(next === "normal" ? null : next);
    },
  ];
}
