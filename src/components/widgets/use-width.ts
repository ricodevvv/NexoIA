"use client";

import { useCallback, useState } from "react";

/**
 * Mide el ancho de un elemento y lo actualiza cuando cambia. Devuelve un ref
 * callback para ponerlo en el elemento.
 */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const [width, setWidth] = useState(fallback);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback));
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}
