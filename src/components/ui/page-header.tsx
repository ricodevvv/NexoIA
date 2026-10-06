"use client";

import { PanelLeft } from "lucide-react";
import { useShell } from "../shell";

/**
 * Encabezado de las páginas de consola y ajustes: título, descripción y
 * acciones a la derecha. En el celular agrega el botón para abrir el panel.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { toggle } = useShell();
  return (
    <header className="page-header">
      <div className="page-heading">
        <button type="button" className="icon-btn page-menu" onClick={toggle} aria-label="Abrir menú">
          <PanelLeft />
        </button>
        <div>
          {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-desc">{description}</p>}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
