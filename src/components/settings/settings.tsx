"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Brain, Check, ExternalLink, Link2, Loader2, PanelLeft, Plug, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { Plan, PlanId } from "@/lib/billing/plans";
import { useShell } from "../shell";
import styles from "./settings.module.css";
import { authErrorMessage } from "@/lib/auth-errors";

type Server = { id: string; name: string; url: string; enabled: boolean };
type KeyRow = { provider: "anthropic" | "openai"; hint: string };

type Props = {
  initialTab: string;
  checkoutOk: boolean;
  user: { name: string; email: string; emailVerified: boolean };
  keys: KeyRow[];
  personalization: {
    settings: { preferences: string; memoryEnabled: boolean; artifactsEnabled: boolean; codeEnabled: boolean };
    codeAvailable: boolean;
    memories: { id: string; content: string; createdAt: string }[];
    shares: { id: string; conversationId: string; title: string; createdAt: string }[];
    styles: { id: string; name: string; instructions: string }[];
  };
  servers: Server[];
  serverKeys: { anthropic: boolean; openai: boolean };
  billing: {
    plan: PlanId;
    used: number;
    limit: number;
    plans: Plan[];
    stripe: boolean;
    renewsAt: string | null;
    status: string | null;
  };
};

const TABS = [
  { id: "account", label: "Cuenta" },
  { id: "personalization", label: "Personalización" },
  { id: "keys", label: "API keys" },
  { id: "connectors", label: "Conectores" },
  { id: "billing", label: "Plan" },
] as const;

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Algo salió mal");
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Pantalla de ajustes con pestañas: cuenta, keys, conectores MCP y plan.
 */
export function Settings(props: Props) {
  const { collapsed, toggle } = useShell();
  const [tab, setTab] = useState(TABS.some((t) => t.id === props.initialTab) ? props.initialTab : "account");

  function select(id: string) {
    setTab(id);
    window.history.replaceState(null, "", `/settings?tab=${id}`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header} data-collapsed={collapsed}>
        <button className={`icon-btn ${styles.mobileMenu}`} onClick={toggle} aria-label="Mostrar barra lateral">
          <PanelLeft />
        </button>
        <h1>Ajustes</h1>
      </header>
      <div className={styles.layout}>
        <nav className={styles.tabs} role="tablist" aria-label="Secciones de ajustes">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={styles.tab} onClick={() => select(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <section className={styles.panel} role="tabpanel">
          {tab === "account" && <Account user={props.user} />}
          {tab === "personalization" && <Personalization data={props.personalization} />}
          {tab === "keys" && <Keys keys={props.keys} serverKeys={props.serverKeys} />}
          {tab === "connectors" && <Connectors servers={props.servers} />}
          {tab === "billing" && <Billing billing={props.billing} checkoutOk={props.checkoutOk} />}
        </section>
      </div>
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Account({ user }: { user: Props["user"] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [verifySent, setVerifySent] = useState(false);

  async function resendVerification() {
    await authClient.sendVerificationEmail({ email: user.email, callbackURL: "/settings" });
    setVerifySent(true);
  }

  async function saveName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    const { error } = await authClient.updateUser({ name });
    setMsg(error ? { kind: "error", text: authErrorMessage(error, "No se pudo guardar") } : { kind: "ok", text: "Guardado" });
    if (!error) router.refresh();
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const { error } = await authClient.changePassword({
      currentPassword: String(data.get("current")),
      newPassword: String(data.get("next")),
      revokeOtherSessions: true,
    });
    setPwMsg(error ? { kind: "error", text: authErrorMessage(error, "No se pudo cambiar") } : { kind: "ok", text: "Contraseña actualizada" });
    if (!error) form.reset();
  }

  async function deleteAccount() {
    await authClient.deleteUser();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {!user.emailVerified && (
        <p className={styles.warning} role="status">
          Tu correo no está confirmado. Confírmalo para poder recuperar la cuenta si olvidas la contraseña.{" "}
          {verifySent ? (
            <strong>Enlace enviado.</strong>
          ) : (
            <button className={styles.linkButton} onClick={resendVerification}>
              Enviar enlace
            </button>
          )}
        </p>
      )}
      <Section title="Perfil" description={user.email}>
        <form className={styles.inline} onSubmit={saveName}>
          <label className="field">
            <span>Nombre</span>
            <input className="input" name="name" defaultValue={user.name} required maxLength={80} />
          </label>
          <button className="btn btn-primary">Guardar</button>
        </form>
        {msg && <p className={msg.kind === "ok" ? styles.ok : "error-text"}>{msg.text}</p>}
      </Section>

      <Section title="Contraseña" description="Al cambiarla se cierran tus otras sesiones.">
        <form className={styles.stack} onSubmit={changePassword}>
          <label className="field">
            <span>Contraseña actual</span>
            <input className="input" name="current" type="password" required autoComplete="current-password" />
          </label>
          <label className="field">
            <span>Nueva contraseña</span>
            <input className="input" name="next" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <div>
            <button className="btn">Cambiar contraseña</button>
          </div>
          {pwMsg && <p className={pwMsg.kind === "ok" ? styles.ok : "error-text"}>{pwMsg.text}</p>}
        </form>
      </Section>

      <Section title="Tus datos" description="Descarga todos tus chats, proyectos, memoria y ajustes en un archivo JSON.">
        <div>
          <a className="btn" href="/api/export" download>
            Exportar mis datos
          </a>
        </div>
      </Section>

      <Section title="Zona de peligro" description="Borra tu cuenta, tus chats, archivos y conectores. No se puede deshacer.">
        <div>
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            Eliminar mi cuenta
          </button>
        </div>
      </Section>

      <Dialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>¿Eliminar tu cuenta?</Dialog.Title>
            <Dialog.Description className="muted">
              Se borra todo de forma permanente. Si tienes una suscripción, cancélala antes desde la pestaña Plan.
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Cancelar</Dialog.Close>
              <button className="btn btn-danger" onClick={deleteAccount}>
                Sí, eliminar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function Toggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.toggleRow}>
      <span>
        <strong>{label}</strong>
        <span className="muted">{description}</span>
      </span>
      <span className={styles.switch}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

function StylesSection({ styles: list }: { styles: Props["personalization"]["styles"] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      await api("/api/styles", {
        method: "POST",
        body: JSON.stringify({ name: data.get("name"), instructions: data.get("instructions") }),
      });
      form.reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/api/styles?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Section
      title="Estilos de respuesta"
      description="Además de Normal, Conciso, Explicativo y Formal, crea los tuyos y elígelos desde el botón de pluma del composer."
    >
      {list.length > 0 && (
        <ul className={styles.memories}>
          {list.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{s.name}</strong>
                <span className={styles.styleText}>{s.instructions}</span>
              </span>
              <button className="icon-btn" onClick={() => remove(s.id)} aria-label={`Borrar estilo ${s.name}`}>
                <Trash2 />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className={styles.stack} onSubmit={create}>
        <label className="field">
          <span>Nombre</span>
          <input className="input" name="name" required maxLength={40} placeholder="Tutor socrático" />
        </label>
        <label className="field">
          <span>Instrucciones</span>
          <textarea
            className={`textarea ${styles.prefs}`}
            name="instructions"
            required
            minLength={10}
            maxLength={4000}
            rows={4}
            placeholder="En vez de darme la respuesta, guíame con preguntas hasta que llegue yo solo."
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div>
          <button className="btn" disabled={busy}>
            Crear estilo
          </button>
        </div>
      </form>
    </Section>
  );
}

function Personalization({ data }: { data: Props["personalization"] }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(data.settings.preferences);
  const [saved, setSaved] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [newMemory, setNewMemory] = useState("");

  async function save(patch: Record<string, unknown>) {
    await api("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
    router.refresh();
  }

  async function removeMemory(id: string) {
    await api(`/api/memory?id=${id}`, { method: "DELETE" });
    setConfirmWipe(false);
    router.refresh();
  }

  async function addMemory(e: React.FormEvent) {
    e.preventDefault();
    if (newMemory.trim().length < 3) return;
    await api("/api/memory", { method: "POST", body: JSON.stringify({ content: newMemory }) });
    setNewMemory("");
    router.refresh();
  }

  async function unshare(conversationId: string) {
    await api(`/api/conversations/${conversationId}/share`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <Section
        title="Preferencias personales"
        description="Nexo las tiene en cuenta en todas tus conversaciones: cómo quieres que te hable, a qué te dedicas, qué evitar."
      >
        <form
          className={styles.stack}
          onSubmit={async (e) => {
            e.preventDefault();
            await save({ preferences: prefs });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
        >
          <textarea
            className={`textarea ${styles.prefs}`}
            value={prefs}
            onChange={(e) => setPrefs(e.target.value)}
            rows={5}
            maxLength={5000}
            placeholder="Ej.: Soy dev backend, trabajo con Java y Kotlin. Respóndeme corto y con código cuando aplique."
          />
          <div className={styles.inlineEnd}>
            {saved && <span className={styles.ok}>Guardado</span>}
            <button className="btn btn-primary" disabled={prefs === data.settings.preferences}>
              Guardar preferencias
            </button>
          </div>
        </form>
      </Section>

      <div id="estilos">
        <StylesSection styles={data.styles} />
      </div>

      <Section title="Funciones">
        <div className={styles.rows}>
          <Toggle
            checked={data.settings.artifactsEnabled}
            label="Artifacts"
            description="Páginas, componentes, diagramas y documentos en un panel aparte con vista previa."
            onChange={(v) => save({ artifactsEnabled: v })}
          />
          {data.codeAvailable && (
            <Toggle
              checked={data.settings.codeEnabled}
              label="Ejecución de código"
              description="Nexo corre Python en un sandbox para calcular, analizar tus archivos y hacer gráficas."
              onChange={(v) => save({ codeEnabled: v })}
            />
          )}
          <Toggle
            checked={data.settings.memoryEnabled}
            label="Memoria"
            description="Nexo guarda datos útiles sobre ti y los recuerda en chats futuros."
            onChange={(v) => save({ memoryEnabled: v })}
          />
        </div>
      </Section>

      <Section
        title={`Memoria · ${data.memories.length}`}
        description="Lo que Nexo recuerda de ti. Puedes borrar lo que quieras o agregar cosas a mano."
      >
        <form className={styles.inline} onSubmit={addMemory}>
          <label className="field">
            <span className="sr-only">Nuevo recuerdo</span>
            <input
              className="input"
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              maxLength={500}
              placeholder="Ej.: Prefiere ejemplos en TypeScript"
            />
          </label>
          <button className="btn">Agregar</button>
        </form>
        {data.memories.length === 0 ? (
          <div className={styles.empty}>
            <Brain size={20} aria-hidden="true" />
            <p>Todavía no hay recuerdos.</p>
          </div>
        ) : (
          <ul className={styles.memories}>
            {data.memories.map((m) => (
              <li key={m.id}>
                <span>{m.content}</span>
                <time className="label" dateTime={m.createdAt}>
                  {new Date(m.createdAt).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                </time>
                <button className="icon-btn" onClick={() => removeMemory(m.id)} aria-label="Borrar recuerdo">
                  <Trash2 />
                </button>
              </li>
            ))}
          </ul>
        )}
        {data.memories.length > 0 && (
          <div>
            {confirmWipe ? (
              <span className={styles.inlineEnd}>
                <span className="muted">¿Seguro? No se puede deshacer.</span>
                <button className="btn btn-sm" onClick={() => setConfirmWipe(false)}>
                  No
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => removeMemory("all")}>
                  Sí, borrar todo
                </button>
              </span>
            ) : (
              <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setConfirmWipe(true)}>
                Borrar toda la memoria
              </button>
            )}
          </div>
        )}
      </Section>

      <Section title="Enlaces compartidos" description="Chats que tienen un enlace público activo.">
        {data.shares.length === 0 ? (
          <div className={styles.empty}>
            <Link2 size={20} aria-hidden="true" />
            <p>No has compartido ningún chat.</p>
          </div>
        ) : (
          <ul className={styles.memories}>
            {data.shares.map((x) => (
              <li key={x.id}>
                <Link href={`/chat/${x.conversationId}`}>{x.title}</Link>
                <a className="icon-btn" href={`/share/${x.id}`} target="_blank" rel="noopener noreferrer" aria-label="Abrir enlace público">
                  <ExternalLink />
                </a>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => unshare(x.conversationId)}>
                  Dejar de compartir
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-…", url: "https://console.anthropic.com/settings/keys" },
  { id: "openai", name: "OpenAI", placeholder: "sk-…", url: "https://platform.openai.com/api-keys" },
] as const;

function Keys({ keys, serverKeys }: { keys: KeyRow[]; serverKeys: Props["serverKeys"] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function save(provider: string, form: HTMLFormElement) {
    const key = String(new FormData(form).get("key")).trim();
    setError(null);
    try {
      await api("/api/keys", { method: "PUT", body: JSON.stringify({ provider, key }) });
      form.reset();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(provider: string) {
    await api(`/api/keys?provider=${provider}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Section
      title="Tus API keys"
      description="Con tu propia key usas cualquier modelo de ese proveedor sin los límites del plan. Se guardan cifradas y nunca se muestran completas."
    >
      <div className={styles.rows}>
        {PROVIDERS.map((p) => {
          const own = keys.find((k) => k.provider === p.id);
          return (
            <div key={p.id} className={styles.row}>
              <div className={styles.rowHead}>
                <strong>{p.name}</strong>
                {own ? (
                  <span className="tag tag-accent">Tu key {own.hint}</span>
                ) : serverKeys[p.id] ? (
                  <span className="tag">Usando la del servidor</span>
                ) : (
                  <span className="tag">Sin key</span>
                )}
              </div>
              <form
                className={styles.inline}
                onSubmit={(e) => {
                  e.preventDefault();
                  save(p.id, e.currentTarget);
                }}
              >
                <label className="field">
                  <span className="sr-only">API key de {p.name}</span>
                  <input className="input" name="key" type="password" placeholder={p.placeholder} required autoComplete="off" />
                </label>
                <button className="btn">{own ? "Reemplazar" : "Guardar"}</button>
                {own && (
                  <button type="button" className="btn btn-ghost btn-danger" onClick={() => remove(p.id)}>
                    Quitar
                  </button>
                )}
              </form>
              <a className="hint" href={p.url} target="_blank" rel="noopener noreferrer">
                Consigue una key de {p.name} →
              </a>
            </div>
          );
        })}
      </div>
      {error && <p className="error-text">{error}</p>}
    </Section>
  );
}

function parseHeaders(raw: string) {
  const headers: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return headers;
}

/**
 * Lista y alta de conectores MCP. Con `workspace` opera sobre los del equipo
 * activo; si `readOnly`, solo se pueden probar.
 */
export function Connectors({ servers, workspace = false, readOnly = false }: { servers: Server[]; workspace?: boolean; readOnly?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [tests, setTests] = useState<Record<string, { loading?: boolean; ok?: boolean; text?: string }>>({});

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError(null);
    setAdding(true);
    try {
      await api(workspace ? "/api/mcp?workspace=1" : "/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          name: String(data.get("name")),
          url: String(data.get("url")),
          headers: parseHeaders(String(data.get("headers") ?? "")),
        }),
      });
      form.reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function test(id: string) {
    setTests((t) => ({ ...t, [id]: { loading: true } }));
    const res = await api(`/api/mcp/${id}`).catch((e) => ({ ok: false, error: e.message }));
    setTests((t) => ({
      ...t,
      [id]: res.ok
        ? { ok: true, text: res.tools.length ? res.tools.map((x: { name: string }) => x.name).join(", ") : "Sin tools" }
        : { ok: false, text: res.error },
    }));
  }

  async function setEnabled(id: string, enabled: boolean) {
    await api(`/api/mcp/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
    router.refresh();
  }

  async function remove(id: string) {
    await api(`/api/mcp/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <Section
        title={workspace ? "Conectores del equipo" : "Conectores MCP"}
        description={
          workspace
            ? "Sus tools quedan disponibles para todo el equipo mientras tengan este equipo activo. Los headers no se muestran a nadie."
            : "Conecta servidores MCP remotos y sus tools quedan disponibles en todos tus chats, con cualquier modelo."
        }
      >
        {servers.length === 0 ? (
          <div className={styles.empty}>
            <Plug size={20} aria-hidden="true" />
            <p>{workspace ? "El equipo todavía no tiene conectores." : "Todavía no tienes conectores."}</p>
          </div>
        ) : (
          <ul className={styles.rows}>
            {servers.map((s) => {
              const t = tests[s.id];
              return (
                <li key={s.id} className={styles.row}>
                  <div className={styles.rowHead}>
                    <strong>{s.name}</strong>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        disabled={readOnly}
                        onChange={(e) => setEnabled(s.id, e.target.checked)}
                      />
                      <span aria-hidden="true" />
                      <span className="sr-only">Activar {s.name}</span>
                    </label>
                  </div>
                  <code className={styles.url}>{s.url}</code>
                  <div className={styles.rowActions}>
                    <button className="btn btn-sm" onClick={() => test(s.id)} disabled={t?.loading}>
                      {t?.loading ? <Loader2 size={12} className={styles.spin} /> : null}
                      Probar conexión
                    </button>
                    {!readOnly && (
                      <button className="btn btn-sm btn-ghost btn-danger" onClick={() => remove(s.id)}>
                        <Trash2 size={12} /> Quitar
                      </button>
                    )}
                  </div>
                  {t && !t.loading && (
                    <p className={t.ok ? styles.ok : "error-text"}>
                      {t.ok ? `Conectado. Tools: ${t.text}` : `No conecta: ${t.text}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {!readOnly && (
      <Section title="Agregar conector" description="Soporta Streamable HTTP y SSE.">
        <form className={styles.stack} onSubmit={add}>
          <div className={styles.grid2}>
            <label className="field">
              <span>Nombre</span>
              <input className="input" name="name" required maxLength={40} placeholder="GitHub" />
            </label>
            <label className="field">
              <span>URL del servidor</span>
              <input className="input" name="url" type="url" required placeholder="https://ejemplo.com/mcp" />
            </label>
          </div>
          <label className="field">
            <span>Headers (opcional)</span>
            <textarea className="textarea" name="headers" rows={3} placeholder={"Authorization: Bearer tu-token"} />
            <small className="hint">Uno por línea. Se guardan cifrados.</small>
          </label>
          {error && <p className="error-text">{error}</p>}
          <div>
            <button className="btn btn-primary" disabled={adding} aria-busy={adding}>
              {adding ? "Agregando…" : "Agregar conector"}
            </button>
          </div>
        </form>
      </Section>
      )}
    </>
  );
}

function Billing({ billing, checkoutOk }: { billing: Props["billing"]; checkoutOk: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pct = Math.min(100, Math.round((billing.used / billing.limit) * 100));

  async function go(path: "checkout" | "portal") {
    setLoading(path);
    setError(null);
    try {
      const { url } = await api(`/api/billing/${path}`, { method: "POST" });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setLoading(null);
    }
  }

  return (
    <>
      {checkoutOk && (
        <p className={styles.banner} role="status">
          <Check size={15} aria-hidden="true" /> Listo. Tu plan se actualiza en cuanto Stripe confirme el pago.
        </p>
      )}
      <Section title="Uso de hoy" description="Los mensajes con tu propia API key no cuentan.">
        <div className={styles.meter} role="meter" aria-valuenow={billing.used} aria-valuemin={0} aria-valuemax={billing.limit}>
          <div style={{ inlineSize: `${pct}%` }} />
        </div>
        <p className="label">
          {billing.used} / {billing.limit} mensajes
        </p>
      </Section>

      <Section title="Planes">
        <div className={styles.plans}>
          {billing.plans.map((p) => {
            const current = p.id === billing.plan;
            return (
              <div key={p.id} className={styles.plan} data-current={current}>
                <div className={styles.planHead}>
                  <h3>{p.name}</h3>
                  {current && <span className="tag tag-accent">Tu plan</span>}
                </div>
                <p className={styles.price}>{p.price}</p>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>
                      <Check size={13} aria-hidden="true" /> {f}
                    </li>
                  ))}
                </ul>
                {p.id === "pro" && !current && (
                  <button className="btn btn-accent" disabled={!billing.stripe || loading !== null} onClick={() => go("checkout")}>
                    {loading === "checkout" ? "Abriendo Stripe…" : "Mejorar a Pro"}
                  </button>
                )}
                {p.id === "pro" && current && (
                  <button className="btn" disabled={loading !== null} onClick={() => go("portal")}>
                    {loading === "portal" ? "Abriendo…" : "Gestionar suscripción"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {billing.renewsAt && billing.plan === "pro" && (
          <p className="hint">
            Estado: {billing.status} · Próxima renovación: {new Date(billing.renewsAt).toLocaleDateString("es")}
          </p>
        )}
        {!billing.stripe && <p className="hint">Los pagos todavía no están configurados en este servidor.</p>}
        {error && <p className="error-text">{error}</p>}
      </Section>
    </>
  );
}
