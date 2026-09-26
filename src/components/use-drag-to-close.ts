"use client";

import { useCallback, useRef } from "react";

const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.6;

/**
 * Deja cerrar una hoja arrastrándola hacia abajo, como en iOS. Se engancha a
 * la zona de arrastre (la barrita y el encabezado) y mueve el elemento de la
 * hoja con el dedo; al soltar, la cierra si se bajó lo suficiente o rápido, o
 * la regresa con resorte. Solo actúa cuando la hoja sale desde abajo.
 */
export function useDragToClose<T extends HTMLElement>(onClose: () => void) {
  const sheetRef = useRef<T>(null);
  const drag = useRef<{ id: number; startY: number; lastY: number; lastT: number; velocity: number } | null>(null);

  const reset = useCallback((el: T) => {
    el.style.transition = "transform var(--dur-base) var(--ease-spring)";
    el.style.transform = "";
    el.addEventListener("transitionend", () => el.style.removeProperty("transition"), { once: true });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = sheetRef.current;
    if (!el || e.button !== 0 || !window.matchMedia("(max-width: 860px)").matches) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    drag.current = { id: e.pointerId, startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    el.dataset.dragging = "true";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dy = e.clientY - d.startY;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    el.style.transform = `translateY(${dy > 0 ? dy : dy / 6}px)`;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      const el = sheetRef.current;
      if (!d || !el || e.pointerId !== d.id) return;
      drag.current = null;
      delete el.dataset.dragging;
      const dy = e.clientY - d.startY;
      if (dy > CLOSE_DISTANCE || (dy > 20 && d.velocity > CLOSE_VELOCITY)) {
        el.style.transition = "transform 0.2s var(--ease-exit)";
        el.style.transform = "translateY(100%)";
        el.addEventListener("transitionend", onClose, { once: true });
        return;
      }
      reset(el);
    },
    [onClose, reset],
  );

  return {
    sheetRef,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
