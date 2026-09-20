"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown, Plus, Settings2, User, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { notifyConversationsChanged } from "./events";
import styles from "./sidebar.module.css";

export type WorkspaceOption = { id: string; name: string; role: "owner" | "admin" | "member" };

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return `${base || "equipo"}-${Math.random().toString(36).slice(2, 7)}`;
}

const ROLE_LABEL = { owner: "Dueño", admin: "Admin", member: "Miembro" };

/**
 * Selector entre el espacio personal y los equipos del usuario. El equipo
 * activo decide qué proyectos compartidos y conectores de equipo se usan.
 */
export function WorkspaceSwitcher({ workspaces, active }: { workspaces: WorkspaceOption[]; active: string | null }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = workspaces.find((w) => w.id === active) ?? null;

  async function select(id: string | null) {
    await authClient.organization.setActive({ organizationId: id });
    notifyConversationsChanged();
    router.refresh();
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.organization.create({ name, slug: slugify(name) });
    if (err || !data) {
      setBusy(false);
      setError(err?.message ?? "No se pudo crear el equipo");
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    setBusy(false);
    setCreating(false);
    router.push("/workspace");
    router.refresh();
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger className={styles.workspace}>
          <span className={styles.workspaceIcon} aria-hidden="true">
            {current ? <Users size={14} /> : <User size={14} />}
          </span>
          <span className={styles.workspaceText}>
            <span className={styles.workspaceName}>{current?.name ?? "Personal"}</span>
            <span className="label">{current ? ROLE_LABEL[current.role] : "Solo tú"}</span>
          </span>
          <ChevronsUpDown size={14} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className={`menu ${styles.workspaceMenu}`} align="start" sideOffset={4}>
            <p className="menu-label label">Espacios</p>
            <Menu.Item className="menu-item" onSelect={() => select(null)}>
              <User /> <span className={styles.grow}>Personal</span> {!current && <Check />}
            </Menu.Item>
            {workspaces.map((w) => (
              <Menu.Item key={w.id} className="menu-item" onSelect={() => select(w.id)}>
                <Users /> <span className={styles.grow}>{w.name}</span> {current?.id === w.id && <Check />}
              </Menu.Item>
            ))}
            <Menu.Separator className="menu-sep" />
            {current && (
              <Menu.Item className="menu-item" onSelect={() => router.push("/workspace")}>
                <Settings2 /> Administrar {current.name}
              </Menu.Item>
            )}
            <Menu.Item className="menu-item" onSelect={() => setCreating(true)}>
              <Plus /> Crear equipo
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      <Dialog.Root open={creating} onOpenChange={setCreating}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Crear un equipo</Dialog.Title>
            <Dialog.Description className="muted">
              Comparte proyectos y conectores con tu gente. Los chats de cada quien siguen siendo privados.
            </Dialog.Description>
            <form onSubmit={create} className={styles.createForm}>
              <label className="field">
                <span>Nombre del equipo</span>
                <input className="input" name="name" required maxLength={60} autoFocus placeholder="Acme, Laboratorio, Familia…" />
              </label>
              {error && <p className="error-text">{error}</p>}
              <div className="dialog-actions">
                <Dialog.Close type="button" className="btn">
                  Cancelar
                </Dialog.Close>
                <button className="btn btn-primary" disabled={busy} aria-busy={busy}>
                  Crear equipo
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
