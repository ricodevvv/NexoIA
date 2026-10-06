"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Coins, Gauge, Mail, MessagesSquare, Trash2, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { AuditRow } from "@/lib/audit";
import { authErrorMessage } from "@/lib/auth-errors";
import type { UsageReport } from "@/lib/platform/analytics";
import { StackedColumns } from "../charts/charts";
import { notifyConversationsChanged } from "../events";
import { ActivityLog } from "../platform/activity-log";
import { sourceColumns } from "../platform/overview";
import { Connectors, Section } from "../settings/settings";
import styles from "../settings/settings.module.css";
import { formatCompact, formatCost, formatNumber, percentChange } from "../ui/format";
import { PageHeader } from "../ui/page-header";
import { StatCard } from "../ui/stat-card";

type Role = "owner" | "admin" | "member";

type Props = {
  initialTab: string;
  checkoutOk: boolean;
  me: string;
  workspace: { id: string; name: string; role: Role };
  manage: boolean;
  report: UsageReport;
  activity: AuditRow[];
  members: {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: Role;
    joinedAt: string;
    messages: number;
    tokens: number;
    cost: number;
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
  { id: "members", label: "Miembros", admin: false },
  { id: "usage", label: "Uso", admin: false },
  { id: "activity", label: "Actividad", admin: true },
  { id: "connectors", label: "Conectores", admin: false },
  { id: "plan", label: "Plan", admin: false },
  { id: "general", label: "General", admin: false },
];

/**
 * Administración del equipo activo: miembros e invitaciones, conectores
 * compartidos, uso por persona, plan Team y ajustes generales.
 */
export function WorkspaceAdmin(props: Props) {
  const tabs = TABS.filter((t) => !t.admin || props.manage);
  const [tab, setTab] = useState(tabs.some((t) => t.id === props.initialTab) ? props.initialTab : "members");

  function select(id: string) {
    setTab(id);
    window.history.replaceState(null, "", `/workspace?tab=${id}`);
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader
          eyebrow={
            <>
              <Users size={13} aria-hidden="true" /> Equipo · {ROLE_LABEL[props.workspace.role]}
            </>
          }
          title={props.workspace.name}
          description={`${props.members.length} ${props.members.length === 1 ? "miembro" : "miembros"}. Comparten proyectos y conectores; los chats de cada quien son privados.`}
        />
        <div className={styles.layout}>
          <nav className={styles.tabs} role="tablist" aria-label="Secciones del equipo">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={styles.tab} onClick={() => select(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <section className={styles.panel} role="tabpanel" key={tab}>
            {tab === "members" && <Members {...props} />}
            {tab === "connectors" && <Connectors servers={props.servers} workspace readOnly={!props.manage} />}
            {tab === "usage" && <UsageTab members={props.members} report={props.report} />}
            {tab === "activity" && props.manage && <ActivityLog initial={props.activity} endpoint="/api/workspace/activity" showActor />}
            {tab === "plan" && <PlanTab billing={props.billing} manage={props.manage} checkoutOk={props.checkoutOk} members={props.members.length} />}
            {tab === "general" && <General {...props} />}
          </section>
        </div>
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

function UsageTab({ members, report }: { members: Props["members"]; report: UsageReport }) {
  const sorted = [...members].sort((a, b) => b.messages - a.messages);
  const max = Math.max(1, ...members.map((m) => m.messages));
  const columns = sourceColumns(report);
  const { totals, previous } = report;
  return (
    <>
      <div className="grid-kpi">
        <StatCard label="Peticiones" icon={<MessagesSquare aria-hidden="true" />} value={formatNumber(totals.requests)} change={percentChange(totals.requests, previous.requests)} hint="30 días" />
        <StatCard label="Tokens" icon={<Gauge aria-hidden="true" />} value={formatCompact(totals.inputTokens + totals.outputTokens)} />
        <StatCard label="Costo estimado" icon={<Coins aria-hidden="true" />} value={formatCost(totals.cost)} change={percentChange(totals.cost, previous.cost)} goodWhenUp={false} />
      </div>
      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Actividad del equipo</h2>
          <p className="card-desc">Peticiones por día de todos los miembros.</p>
        </div>
        <div className="card-body">
          <StackedColumns points={columns.points} series={columns.series} label="Peticiones del equipo por día" format={formatCompact} height={200} />
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Por miembro</h2>
        </div>
        <div className="card-body flush">
          <div className="table-wrap">
            <table className="table stack-sm">
              <thead>
                <tr>
                  <th scope="col">Miembro</th>
                  <th scope="col">Peticiones</th>
                  <th scope="col" className="num">
                    Tokens
                  </th>
                  <th scope="col" className="num">
                    Costo
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">
                      <span className="cell-title">{m.name}</span>
                      <span className="cell-sub">{m.email}</span>
                    </th>
                    <td data-label="Peticiones">
                      <span className={styles.barCell}>
                        <span className={styles.bar} style={{ inlineSize: `${(m.messages / max) * 100}%` }} />
                        <span className={styles.num}>{formatNumber(m.messages)}</span>
                      </span>
                    </td>
                    <td className="num" data-label="Tokens">
                      {formatCompact(m.tokens)}
                    </td>
                    <td className="num" data-label="Costo">
                      {formatCost(m.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
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
