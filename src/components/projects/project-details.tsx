"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { FileText, Image as ImageIcon, Loader2, MessageSquare, MoreHorizontal, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { notifyConversationsChanged } from "../events";
import styles from "./projects.module.css";

type Props = {
  project: { id: string; name: string; description: string; instructions: string };
  canEdit: boolean;
  team: string | null;
  files: { id: string; name: string; mediaType: string; size: number }[];
  chats: { id: string; title: string; updatedAt: string }[];
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function uploadFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/attachments", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "No se pudo subir");
  return data.id as string;
}

/**
 * Lo que se ve debajo del composer en un proyecto: sus chats, instrucciones y
 * archivos de conocimiento.
 */
export function ProjectDetails({ project, files, chats, canEdit, team }: Props) {
  const router = useRouter();
  const [instructions, setInstructions] = useState(project.instructions);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function patch(data: Record<string, string>) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo guardar");
    router.refresh();
  }

  async function addFiles(list: FileList) {
    setError(null);
    for (const file of Array.from(list)) {
      setUploading((n) => n + 1);
      try {
        const attachmentId = await uploadFile(file);
        const res = await fetch(`/api/projects/${project.id}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachmentId }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo agregar");
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    router.refresh();
  }

  async function removeFile(id: string) {
    await fetch(`/api/projects/${project.id}/files?attachmentId=${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function removeProject() {
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    notifyConversationsChanged();
    router.push("/projects");
  }

  return (
    <div className={styles.details}>
      <div className={styles.detailsMain}>
        <div className={styles.blockHead}>
          <h3 className="label">{team ? "Tus chats en este proyecto" : "Chats del proyecto"}</h3>
          {canEdit && (
          <Menu.Root>
            <Menu.Trigger className="icon-btn" aria-label="Opciones del proyecto">
              <MoreHorizontal />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="menu" align="end" sideOffset={4}>
                <Menu.Item className="menu-item" onSelect={() => setRenaming(true)}>
                  <Pencil /> Editar nombre y descripción
                </Menu.Item>
                <Menu.Separator className="menu-sep" />
                <Menu.Item className="menu-item" data-danger onSelect={() => setDeleting(true)}>
                  <Trash2 /> Eliminar proyecto
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
          )}
        </div>
        {team && (
          <p className={styles.sharedNote}>
            <Users size={14} aria-hidden="true" /> Compartido con {team}. Tus chats aquí solo los ves tú.
          </p>
        )}
        {chats.length === 0 ? (
          <p className={styles.hintBox}>Empieza un chat arriba. Todos usarán las instrucciones y archivos de este proyecto.</p>
        ) : (
          <ul className={styles.chatList}>
            {chats.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`}>
                  <MessageSquare size={14} aria-hidden="true" />
                  <span>{c.title}</span>
                  <time className="label" dateTime={c.updatedAt}>
                    {new Date(c.updatedAt).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className={styles.knowledge}>
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h3 className="label">Instrucciones</h3>
            {!editing && canEdit && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                {instructions ? "Editar" : "Agregar"}
              </button>
            )}
          </div>
          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await patch({ instructions });
                  setEditing(false);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <textarea
                className={`textarea ${styles.instructions}`}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={8}
                maxLength={20000}
                autoFocus
                placeholder="Ej.: Responde como profesor de física, con ejemplos cotidianos y sin fórmulas avanzadas."
              />
              <div className={styles.formActions}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setInstructions(project.instructions);
                    setEditing(false);
                  }}
                >
                  Cancelar
                </button>
                <button className="btn btn-sm btn-primary">Guardar</button>
              </div>
            </form>
          ) : (
            <p className={styles.instructionsText}>{instructions || "Sin instrucciones. Dile a Nexo cómo quieres que trabaje en este proyecto."}</p>
          )}
        </section>

        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h3 className="label">Archivos · {files.length}</h3>
            {canEdit && (
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
                {uploading > 0 ? <Loader2 size={12} className={styles.spin} /> : <Plus size={12} />} Agregar
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/*,.md,.json,.csv,.ts,.tsx,.js,.py,.java,.kt,.go,.rs,.yaml,.yml"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {files.length === 0 ? (
            <p className={styles.hintBox}>Sube documentos, código o imágenes que Nexo deba tener siempre a mano.</p>
          ) : (
            <ul className={styles.files}>
              {files.map((f) => (
                <li key={f.id}>
                  {f.mediaType.startsWith("image/") ? <ImageIcon size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                  <a href={`/api/attachments/${f.id}`} target="_blank" rel="noopener noreferrer">
                    {f.name}
                  </a>
                  <span className="label">{formatSize(f.size)}</span>
                  {canEdit && (
                    <button className={styles.fileRemove} onClick={() => removeFile(f.id)} aria-label={`Quitar ${f.name}`}>
                      <X size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="error-text">{error}</p>}
        </section>
      </aside>

      <Dialog.Root open={renaming} onOpenChange={setRenaming}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Editar proyecto</Dialog.Title>
            <form
              className={styles.form}
              onSubmit={async (e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                await patch({ name: String(data.get("name")), description: String(data.get("description")) });
                setRenaming(false);
              }}
            >
              <label className="field">
                <span>Nombre</span>
                <input className="input" name="name" defaultValue={project.name} required maxLength={80} />
              </label>
              <label className="field">
                <span>Descripción</span>
                <input className="input" name="description" defaultValue={project.description} maxLength={300} />
              </label>
              <div className="dialog-actions">
                <Dialog.Close type="button" className="btn">
                  Cancelar
                </Dialog.Close>
                <button className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deleting} onOpenChange={setDeleting}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>¿Eliminar “{project.name}”?</Dialog.Title>
            <Dialog.Description className="muted">
              Se borran las instrucciones y la lista de archivos. Los chats no se pierden: pasan a tus chats normales.
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Cancelar</Dialog.Close>
              <button className="btn btn-danger" onClick={removeProject}>
                Eliminar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
