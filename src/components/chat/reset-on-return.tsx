"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

/**
 * Vuelve a montar a sus hijos cuando la URL regresa a `path` desde otra ruta.
 * Sirve para que "Nuevo chat" arranque limpio aunque el chat anterior haya
 * cambiado la URL con history.replaceState sin navegar. Si con atrás/adelante
 * se llega a una URL que no es la de esta página, pide al servidor la correcta.
 */
export function ResetOnReturn({ path, children }: { path: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState({ pathname, generation: 0 });

  if (pathname !== state.pathname) {
    setState({ pathname, generation: pathname === path ? state.generation + 1 : state.generation });
  }

  useEffect(() => {
    function onPop() {
      if (window.location.pathname !== path) router.refresh();
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [path, router]);

  return <Fragment key={state.generation}>{children}</Fragment>;
}
