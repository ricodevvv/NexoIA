import { flushSync } from "react-dom";

export type NavDirection = "nav-forward" | "nav-back";

type StartViewTransition = (options: { update: () => void; types?: string[] }) => unknown;

/**
 * Aplica un cambio de estado de React con una view transition direccional:
 * `nav-forward` desliza la vista nueva desde la derecha y `nav-back` desde la
 * izquierda. Si el navegador no las soporta o el usuario pidió menos
 * movimiento, el cambio se aplica al instante.
 */
export function withViewTransition(update: () => void, direction: NavDirection) {
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  const typed = typeof ViewTransition !== "undefined" && "types" in ViewTransition.prototype;
  if (!start || !typed || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  start.call(document, { update: () => flushSync(update), types: [direction] });
}
