"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { FolderClosed, PanelLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useShell } from "../shell";
import styles from "./projects.module.css";

type Project = { id: string; name: string; description: string; updatedAt: string; chats: number };

function relative(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

/**
 * Lista de proyectos del usuario con el diálogo para crear uno nuevo.
 */
export function ProjectList({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const { collapsed, toggle } = useShell();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.get("name"), description: data.get("description") }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "No se pudo crear");
      return;
    }
    router.push(`/projects/${body.id}`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header} data-collapsed={collapsed}>
        <button className={`icon-btn ${styles.menuBtn}`} onClick={toggle} aria-label="Mostrar barra lateral">
          <PanelLeft />
        </button>
        <div>
          <p className="label">Espacios de trabajo</p>
          <h1>Proyectos</h1>
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className="btn btn-primary">
            <Plus size={15} /> Nuevo proyecto
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog">
              <Dialog.Title>Nuevo proyecto</Dialog.Title>
              <Dialog.Description className="muted">
                Junta chats, instrucciones y archivos sobre un mismo tema.
              </Dialog.Description>
              <form className={styles.form} onSubmit={create}>
                <label className="field">
                  <span>Nombre</span>
                  <input className="input" name="name" required maxLength={80} autoFocus placeholder="Tesis, Startup, Viaje a Japón…" />
                </label>
                <label className="field">
                  <span>Descripción (opcional)</span>
                  <input className="input" name="description" maxLength={300} />
                </label>
                {error && <p className="error-text">{error}</p>}
                <div className="dialog-actions">
                  <Dialog.Close type="button" className="btn">
                    Cancelar
                  </Dialog.Close>
                  <button className="btn btn-primary" disabled={busy}>
                    Crear proyecto
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </header>

      {projects.length === 0 ? (
        <div className={styles.empty}>
          <FolderClosed size={28} aria-hidden="true" />
          <h2>Todavía no tienes proyectos</h2>
          <p className="muted">
            Un proyecto le da a Nexo contexto fijo: instrucciones y archivos que se usan en todos sus chats.
          </p>
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            Crear el primero
          </button>
        </div>
      ) : (
        <ul className={styles.grid}>
          {projects.map((p, i) => (
            <li key={p.id} style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
              <Link href={`/projects/${p.id}`} className={styles.card}>
                <span className={styles.cardIndex}>{String(i + 1).padStart(2, "0")}</span>
                <h2>{p.name}</h2>
                <p>{p.description || "Sin descripción"}</p>
                <span className="label">
                  {p.chats} {p.chats === 1 ? "chat" : "chats"} · {relative(p.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
