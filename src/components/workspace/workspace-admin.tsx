"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Mail, PanelLeft, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { notifyConversationsChanged } from "../events";
import { Connectors, Section } from "../settings/settings";
import styles from "../settings/settings.module.css";
import { useShell } from "../shell";
import { authErrorMessage } from "@/lib/auth-errors";

type Role = "owner" | "admin" | "member";

type Props = {
  initialTab: string;
  checkoutOk: boolean;
  me: string;
  workspace: { id: string; name: string; role: Role };
  manage: boolean;
  members: {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: Role;
    joinedAt: string;
    messages: number;
    tokens: number;
  }[];
  invitations: { id: string; email: string; role: string; expiresAt: string }[];
  servers: { id: string; name: string; url: string; enabled: boolean }[];
  billing: {
    enabled: boolean;
    status: string | null;
    seats: number;
    renewsAt: string | null;
    plan: { name: string; price: string; features: string[] };
  };
};

const ROLE_LABEL: Record<Role, string> = { owner: "Dueño", admin: "Admin", member: "Miembro" };

const TABS = [
  { id: "members", label: "Miembros" },
  { id: "connectors", label: "Conectores" },
  { id: "usage", label: "Uso" },
  { id: "plan", label: "Plan" },
  { id: "general", label: "General" },
];

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} k`;
  return String(n);
}

/**
 * Administración del equipo activo: miembros e invitaciones, conectores
 * compartidos, uso por persona, plan Team y ajustes generales.
 */
export function WorkspaceAdmin(props: Props) {
  const { collapsed, toggle } = useShell();
  const [tab, setTab] = useState(TABS.some((t) => t.id === props.initialTab) ? props.initialTab : "members");

  function select(id: string) {
    setTab(id);
    window.history.replaceState(null, "", `/workspace?tab=${id}`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header} data-collapsed={collapsed}>
        <button className={`icon-btn ${styles.mobileMenu}`} onClick={toggle} aria-label="Mostrar barra lateral">
          <PanelLeft />
        </button>
        <div>
          <p className="label">Equipo · {ROLE_LABEL[props.workspace.role]}</p>
          <h1>{props.workspace.name}</h1>
        </div>
      </header>
      <div className={styles.layout}>
        <nav className={styles.tabs} role="tablist" aria-label="Secciones del equipo">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={styles.tab} onClick={() => select(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <section className={styles.panel} role="tabpanel">
          {tab === "members" && <Members {...props} />}
          {tab === "connectors" && <Connectors servers={props.servers} workspace readOnly={!props.manage} />}
          {tab === "usage" && <UsageTab members={props.members} />}
          {tab === "plan" && <PlanTab billing={props.billing} manage={props.manage} checkoutOk={props.checkoutOk} members={props.members.length} />}
          {tab === "general" && <General {...props} />}
        </section>
      </div>
    </div>
  );
}

function Members({ workspace, manage, members, invitations, me }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myRole = workspace.role;

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email")).trim();
    setBusy(true);
    setError(null);
    setSent(null);
    const { error: err } = await authClient.organization.inviteMember({
      email,
      role: String(data.get("role")) as "member" | "admin",
      organizationId: workspace.id,
      resend: true,
    });
    setBusy(false);
    if (err) {
      setError(authErrorMessage(err, "No se pudo invitar"));
      return;
    }
    form.reset();
    setSent(email);
    router.refresh();
  }

  async function changeRole(memberId: string, role: Role) {
    const { error: err } = await authClient.organization.updateMemberRole({ memberId, role, organizationId: workspace.id });
    if (err) setError(authErrorMessage(err, "No se pudo cambiar el rol"));
    router.refresh();
  }

  async function remove(memberId: string) {
    const { error: err } = await authClient.organization.removeMember({ memberIdOrEmail: memberId, organizationId: workspace.id });
    if (err) setError(authErrorMessage(err, "No se pudo quitar"));
    router.refresh();
  }

  async function cancel(invitationId: string) {
    await authClient.organization.cancelInvitation({ invitationId });
    router.refresh();
  }

  function canTouch(role: Role) {
    if (myRole === "owner") return role !== "owner";
    if (myRole === "admin") return role === "member";
    return false;
  }

  return (
    <>
      {manage && (
        <Section title="Invitar" description="Le llega un correo con el enlace para unirse. La invitación dura 7 días.">
          <form className={styles.inline} onSubmit={invite}>
            <label className="field">
              <span className="sr-only">Correo</span>
              <input className="input" name="email" type="email" required placeholder="nombre@empresa.com" />
            </label>
            <label>
              <span className="sr-only">Rol</span>
              <select className="select" name="role" defaultValue="member">
                <option value="member">Miembro</option>
                {myRole === "owner" && <option value="admin">Admin</option>}
              </select>
            </label>
            <button className="btn btn-primary" disabled={busy} aria-busy={busy}>
              <UserPlus size={14} /> Invitar
            </button>
          </form>
          {sent && (
            <p className={styles.ok}>
              <Check size={13} /> Invitación enviada a {sent}.
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
        </Section>
      )}

      <Section title={`Miembros · ${members.length}`}>
        <ul className={styles.memories}>
          {members.map((m) => (
            <li key={m.id}>
              <span>
                <strong>
                  {m.name}
                  {m.userId === me && " (tú)"}
                </strong>
                <span className={styles.styleText}>{m.email}</span>
              </span>
              {canTouch(m.role) ? (
                <select
                  className="select"
                  value={m.role}
                  onChange={(e) => changeRole(m.id, e.target.value as Role)}
                  aria-label={`Rol de ${m.name}`}
                  style={{ width: 120 }}
                >
                  <option value="member">Miembro</option>
                  {myRole === "owner" && <option value="admin">Admin</option>}
                </select>
              ) : (
                <span className="tag">{ROLE_LABEL[m.role]}</span>
              )}
              {canTouch(m.role) && (
                <button className="icon-btn" onClick={() => remove(m.id)} aria-label={`Quitar a ${m.name}`}>
                  <Trash2 />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {invitations.length > 0 && (
        <Section title={`Invitaciones pendientes · ${invitations.length}`}>
          <ul className={styles.memories}>
            {invitations.map((i) => (
              <li key={i.id}>
                <span>
                  <Mail size={13} aria-hidden="true" /> {i.email}
                  <span className={styles.styleText}>
                    {ROLE_LABEL[(i.role as Role) ?? "member"] ?? i.role} · vence el {new Date(i.expiresAt).toLocaleDateString("es")}
                  </span>
                </span>
                {manage && (
                  <button className="btn btn-sm btn-ghost btn-danger" onClick={() => cancel(i.id)}>
                    Cancelar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function UsageTab({ members }: { members: Props["members"] }) {
  const max = Math.max(1, ...members.map((m) => m.messages));
  const total = members.reduce((acc, m) => acc + m.messages, 0);
  const sorted = [...members].sort((a, b) => b.messages - a.messages);
  return (
    <Section title="Últimos 30 días" description={`${total} mensajes en total. Cuenta todo lo que cada miembro usó en Nexo.`}>
      <table className={styles.usageTable}>
        <thead>
          <tr>
            <th scope="col">Miembro</th>
            <th scope="col">Mensajes</th>
            <th scope="col" className={styles.num}>
              Tokens
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>
                <span className={styles.barCell}>
                  <span className={styles.bar} style={{ inlineSize: `${(m.messages / max) * 100}%` }} />
                  <span className={styles.num}>{m.messages}</span>
                </span>
              </td>
              <td className={styles.num}>{formatTokens(m.tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function PlanTab({ billing, manage, checkoutOk, members }: { billing: Props["billing"]; manage: boolean; checkoutOk: boolean; members: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = billing.status && ["active", "trialing", "past_due"].includes(billing.status);

  async function go() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/billing/team", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo abrir Stripe");
      setLoading(false);
      return;
    }
    window.location.href = data.url;
  }

  return (
    <>
      {checkoutOk && (
        <p className={styles.banner} role="status">
          <Check size={15} aria-hidden="true" /> Listo. El plan se activa en cuanto Stripe confirme el pago.
        </p>
      )}
      <Section title={`Plan ${billing.plan.name}`} description={billing.plan.price}>
        <div className={styles.plan} data-current={Boolean(active)}>
          <div className={styles.planHead}>
            <h3>{active ? "Activo" : "Sin plan"}</h3>
            {active && <span className="tag tag-accent">{billing.seats} asientos</span>}
          </div>
          <ul>
            {billing.plan.features.map((f) => (
              <li key={f}>
                <Check size={13} aria-hidden="true" /> {f}
              </li>
            ))}
          </ul>
          {manage ? (
            <button className={active ? "btn" : "btn btn-accent"} disabled={!billing.enabled || loading} onClick={go}>
              {loading ? "Abriendo Stripe…" : active ? "Gestionar suscripción" : `Activar para ${members} ${members === 1 ? "persona" : "personas"}`}
            </button>
          ) : (
            <p className="hint">Solo los admins del equipo pueden cambiar el plan.</p>
          )}
        </div>
        {active && billing.renewsAt && (
          <p className="hint">
            Estado: {billing.status} · Próxima renovación: {new Date(billing.renewsAt).toLocaleDateString("es")}. Los asientos se ajustan solos
            al sumar o quitar miembros.
          </p>
        )}
        {!billing.enabled && <p className="hint">El plan Team todavía no está configurado en este servidor (falta STRIPE_PRICE_TEAM).</p>}
        {error && <p className="error-text">{error}</p>}
      </Section>
    </>
  );
}

function General({ workspace, manage }: Props) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isOwner = workspace.role === "owner";

  async function rename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    const { error: err } = await authClient.organization.update({ organizationId: workspace.id, data: { name } });
    if (err) {
      setError(authErrorMessage(err, "No se pudo guardar"));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function run() {
    const { error: err } =
      confirm === "delete"
        ? await authClient.organization.delete({ organizationId: workspace.id })
        : await authClient.organization.leave({ organizationId: workspace.id });
    if (err) {
      setError(authErrorMessage(err, "No se pudo completar"));
      setConfirm(null);
      return;
    }
    await authClient.organization.setActive({ organizationId: null });
    notifyConversationsChanged();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {manage && (
        <Section title="Nombre del equipo">
          <form className={styles.inline} onSubmit={rename}>
            <label className="field">
              <span className="sr-only">Nombre</span>
              <input className="input" name="name" defaultValue={workspace.name} required maxLength={60} />
            </label>
            <button className="btn btn-primary">Guardar</button>
          </form>
          {saved && <p className={styles.ok}>Guardado</p>}
        </Section>
      )}
      <Section title="Zona de peligro">
        <div className={styles.inlineStart}>
          {!isOwner && (
            <button className="btn btn-danger" onClick={() => setConfirm("leave")}>
              Salir del equipo
            </button>
          )}
          {isOwner && (
            <button className="btn btn-danger" onClick={() => setConfirm("delete")}>
              Eliminar equipo
            </button>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
      </Section>

      <Dialog.Root open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>{confirm === "delete" ? `¿Eliminar ${workspace.name}?` : `¿Salir de ${workspace.name}?`}</Dialog.Title>
            <Dialog.Description className="muted">
              {confirm === "delete"
                ? "Se borran los proyectos y conectores compartidos del equipo para todos. Cancela antes la suscripción Team si tienes una. Los chats de cada quien no se borran."
                : "Pierdes acceso a los proyectos y conectores del equipo. Tus chats no se borran."}
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Cancelar</Dialog.Close>
              <button className="btn btn-danger" onClick={run}>
                {confirm === "delete" ? "Eliminar" : "Salir"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
