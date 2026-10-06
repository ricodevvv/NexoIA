"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Copy, FileText, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Search, Terminal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { promptVariables } from "@/lib/platform/prompt-text";
import type { PromptView } from "@/lib/platform/prompts";
import { PageHeader } from "../ui/page-header";
import { timeAgo } from "../ui/format";
import { useToast } from "../ui/toast";
import styles from "./prompts.module.css";

type Draft = { id?: string; name: string; description: string; system: string; content: string; model: string; tags: string };

const BLANK: Draft = { name: "", description: "", system: "", content: "", model: "", tags: "" };

const STARTERS: Omit<Draft, "id" | "model">[] = [
  {
    name: "Resumen ejecutivo",
    description: "Convierte un texto largo en un resumen para directivos.",
    system: "Eres un analista que escribe para directivos ocupados. Directo, sin relleno.",
    content: "Resume esto en 5 viñetas, con una línea final de riesgos:\n\n{{texto}}",
    tags: "resumen, negocio",
  },
  {
    name: "Revisor de código",
    description: "Revisión de un diff con foco en bugs y seguridad.",
    system: "Eres un ingeniero senior. Señala bugs reales primero, luego seguridad, luego estilo. Sé concreto y cita líneas.",
    content: "Revisa este cambio en {{lenguaje}}:\n\n```\n{{codigo}}\n```",
    tags: "código, revisión",
  },
  {
    name: "Correo profesional",
    description: "Redacta un correo claro a partir de notas sueltas.",
    system: "Escribes correos en español neutro, cordiales y breves.",
    content: "Escribe un correo para {{destinatario}} con este objetivo: {{objetivo}}. Notas: {{notas}}",
    tags: "redacción",
  },
];

function toDraft(p: PromptView): Draft {
  return { id: p.id, name: p.name, description: p.description, system: p.system, content: p.content, model: p.model ?? "", tags: p.tags.join(", ") };
}

/**
 * Biblioteca de prompts reutilizables con variables `{{así}}`. Cada uno se
 * puede abrir en el playground o usar directo en un chat nuevo.
 */
export function PromptLibrary({ prompts, models }: { prompts: PromptView[]; models: { id: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<PromptView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tags = useMemo(() => [...new Set(prompts.flatMap((p) => p.tags))].sort(), [prompts]);
  const visible = prompts.filter((p) => {
    const q = query.trim().toLowerCase();
    const matches = !q || [p.name, p.description, p.content, ...p.tags].some((t) => t.toLowerCase().includes(q));
    return matches && (!tag || p.tags.includes(tag));
  });
  const draftVars = draft ? promptVariables(draft.system, draft.content) : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    const body = {
      name: draft.name,
      description: draft.description,
      system: draft.system,
      content: draft.content,
      model: draft.model || null,
      tags: draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const res = await fetch(draft.id ? `/api/platform/prompts/${draft.id}` : "/api/platform/prompts", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "No se pudo guardar");
      return;
    }
    toast(draft.id ? "Prompt actualizado" : "Prompt creado");
    setDraft(null);
    router.refresh();
  }

  async function remove(p: PromptView) {
    await fetch(`/api/platform/prompts/${p.id}`, { method: "DELETE" });
    setDeleting(null);
    toast(`Borraste “${p.name}”`);
    router.refresh();
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader
          eyebrow="Plataforma"
          title="Prompts"
          description="Guarda los prompts que más usas, con variables para las partes que cambian. Escribe / en el chat para insertarlos."
          actions={
            <button type="button" className="btn btn-primary" onClick={() => setDraft(BLANK)}>
              <Plus size={15} aria-hidden="true" /> Nuevo prompt
            </button>
          }
        />

        {prompts.length > 0 && (
          <div className="toolbar">
            <label className={styles.search}>
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Buscar prompts</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar prompts" />
            </label>
            {tags.length > 0 && (
              <div className="row" role="group" aria-label="Filtrar por etiqueta">
                <button type="button" className={styles.chip} aria-pressed={tag === null} onClick={() => setTag(null)}>
                  Todas
                </button>
                {tags.map((t) => (
                  <button key={t} type="button" className={styles.chip} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {prompts.length === 0 ? (
          <section className="card">
            <div className="empty-state">
              <FileText aria-hidden="true" />
              <h3>Tu biblioteca está vacía</h3>
              <p>Empieza con una de estas plantillas o crea la tuya.</p>
            </div>
            <div className={styles.starters}>
              {STARTERS.map((s) => (
                <button key={s.name} type="button" className={styles.starter} onClick={() => setDraft({ ...s, model: "" })}>
                  <strong>{s.name}</strong>
                  <span>{s.description}</span>
                </button>
              ))}
            </div>
          </section>
        ) : visible.length === 0 ? (
          <p className="muted">Nada coincide con tu búsqueda.</p>
        ) : (
          <div className="grid-3">
            {visible.map((p) => (
              <article key={p.id} className={`card ${styles.prompt}`}>
                <div className={styles.promptHead}>
                  <h2>{p.name}</h2>
                  <Menu.Root>
                    <Menu.Trigger className="icon-btn" aria-label={`Opciones de ${p.name}`}>
                      <MoreHorizontal />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Content className="menu" align="end" sideOffset={4}>
                        <Menu.Item className="menu-item" onSelect={() => setDraft(toDraft(p))}>
                          <Pencil /> Editar
                        </Menu.Item>
                        <Menu.Item className="menu-item" onSelect={() => setDraft({ ...toDraft(p), id: undefined, name: `${p.name} (copia)` })}>
                          <Copy /> Duplicar
                        </Menu.Item>
                        <Menu.Separator className="menu-sep" />
                        <Menu.Item className="menu-item" data-danger onSelect={() => setDeleting(p)}>
                          <Trash2 /> Borrar
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu.Root>
                </div>
                {p.description && <p className={styles.desc}>{p.description}</p>}
                <pre className={styles.preview}>{p.content}</pre>
                <div className={styles.meta}>
                  {p.variables.map((v) => (
                    <span key={v} className="tag tag-accent">{`{{${v}}}`}</span>
                  ))}
                  {p.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
                <div className={styles.foot}>
                  <span className="hint">
                    {p.uses} {p.uses === 1 ? "uso" : "usos"} · {timeAgo(p.updatedAt)}
                  </span>
                  <span className="spacer" />
                  <Link href={`/?prompt=${p.id}`} className="btn btn-sm" title="Usar en un chat nuevo">
                    <MessageSquarePlus size={13} aria-hidden="true" /> Chat
                  </Link>
                  <Link href={`/platform/playground?prompt=${p.id}`} className="btn btn-sm" title="Abrir en el playground">
                    <Terminal size={13} aria-hidden="true" /> Probar
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Dialog.Root open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog dialog-wide" aria-describedby={undefined}>
            <Dialog.Title>{draft?.id ? "Editar prompt" : "Nuevo prompt"}</Dialog.Title>
            {draft && (
              <form className="stack" style={{ marginTop: 16 }} onSubmit={submit}>
                <div className="grid-2">
                  <label className="field">
                    <span>Nombre</span>
                    <input className="input" required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
                  </label>
                  <label className="field">
                    <span>Modelo sugerido</span>
                    <select className="select" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
                      <option value="">El que esté elegido</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Descripción</span>
                  <input className="input" maxLength={300} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </label>
                <label className="field">
                  <span>System prompt (opcional)</span>
                  <textarea className="textarea" rows={3} value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })} />
                </label>
                <label className="field">
                  <span>Mensaje</span>
                  <textarea
                    className="textarea"
                    rows={6}
                    required
                    value={draft.content}
                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                    placeholder="Traduce al inglés este texto: {{texto}}"
                  />
                  <small className="hint">
                    {draftVars.length ? `Variables: ${draftVars.map((v) => `{{${v}}}`).join(", ")}` : "Usa {{nombre}} para crear variables."}
                  </small>
                </label>
                <label className="field">
                  <span>Etiquetas</span>
                  <input className="input" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="marketing, correo" />
                </label>
                {error && <p className="error-text">{error}</p>}
                <div className="dialog-actions">
                  <Dialog.Close type="button" className="btn">
                    Cancelar
                  </Dialog.Close>
                  <button className="btn btn-primary" disabled={busy} aria-busy={busy}>
                    {draft.id ? "Guardar cambios" : "Crear prompt"}
                  </button>
                </div>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>¿Borrar “{deleting?.name}”?</Dialog.Title>
            <Dialog.Description className="muted">No se puede deshacer.</Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Cancelar</Dialog.Close>
              <button type="button" className="btn btn-danger" onClick={() => deleting && remove(deleting)}>
                Borrar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
