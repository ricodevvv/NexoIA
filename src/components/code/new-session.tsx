"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  ArrowUp,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  ExternalLink,
  FileText,
  FileUp,
  GitBranch,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Search,
  Server,
  Shield,
  Blocks,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useDictation } from "../chat/use-dictation";
import { Axo, AxoLaptop } from "./axo";

function Github({ size = 18 }: { size?: number; "aria-hidden"?: boolean | "true" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.2-3.1-.1-.4-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
import type { CodeModel } from "./code-session";
import { Sheet } from "./sheet";
import styles from "./new-session.module.css";

export type Environment = { id: string; name: string; cloud: boolean };
export type Repo = { fullName: string; private: boolean; defaultBranch: string; canPush: boolean; description: string | null };
export type PromptFile = { name: string; mime: string; url: string };
export type StartInput = { text: string; files: PromptFile[]; repo: Repo | null; branch: string | null; ask: boolean };

const MAX_FILE = 10 * 1024 * 1024;
const VARIANT_LABEL: Record<string, string> = { low: "Bajo", medium: "Medio", high: "Alto", minimal: "Mínimo", max: "Máximo" };

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function readFile(file: File): Promise<PromptFile> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE) return reject(new Error(`${file.name} pasa de 10 MB`));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mime: file.type || "application/octet-stream", url: String(reader.result) });
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function envLabel(env: Environment | undefined) {
  return env?.name ?? "Elegir entorno";
}

/**
 * Pantalla para empezar una sesión de Nexo Code: eliges entorno, repo y
 * modelo, adjuntas contexto y describes la tarea. Sigue el diseño de Claude
 * Code en la web.
 */
export function NewSession(props: {
  userName: string;
  initialText?: string;
  environments: Environment[];
  environment: string | null;
  onEnvironment: (id: string) => void;
  onCreateEnvironment: () => void;
  onEditEnvironment: (id: string) => void;
  models: CodeModel[];
  model: CodeModel | null;
  onModel: (m: CodeModel) => void;
  variant: string | null;
  onVariant: (v: string | null) => void;
  starting: boolean;
  error: string | null;
  onBack?: () => void;
  onStart: (input: StartInput) => void;
}) {
  const [text, setText] = useState(props.initialText ?? "");
  const [files, setFiles] = useState<PromptFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ repo: string; list: string[] | null; error: string | null } | null>(null);
  const [branchQuery, setBranchQuery] = useState("");
  const [ask, setAsk] = useState(false);
  const [sheet, setSheet] = useState<null | "env" | "repos" | "connect" | "branches" | "model" | "effort" | "context" | "permission">(null);
  const [help, setHelp] = useState(false);
  const [repos, setRepos] = useState<{ connected: boolean; repos: Repo[] } | null>(null);
  const [query, setQuery] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const dictation = useDictation((spoken) => setText((t) => (t ? `${t} ${spoken}` : spoken)));
  const current = props.environments.find((e) => e.id === props.environment);
  const variants = props.model?.variants ?? [];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (repos?.repos ?? []).filter((r) => r.fullName !== repo?.fullName && (!q || r.fullName.toLowerCase().includes(q)));
  }, [repos, query, repo]);

  const shownBranches = useMemo(() => {
    const q = branchQuery.trim().toLowerCase();
    return (branches?.list ?? []).filter((b) => !q || b.toLowerCase().includes(q));
  }, [branches, branchQuery]);

  function pickRepo(r: Repo) {
    if (r.fullName !== repo?.fullName) {
      setRepo(r);
      setBranch(null);
      setBranches(null);
    }
    setSheet(null);
  }

  function openBranches() {
    if (!repo) return;
    setBranchQuery("");
    setSheet("branches");
    if (branches?.repo === repo.fullName && branches.list) return;
    setBranches({ repo: repo.fullName, list: null, error: null });
    fetch(`/api/github/branches?repo=${encodeURIComponent(repo.fullName)}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => setBranches({ repo: repo.fullName, list: ok ? data.branches : [], error: ok ? null : (data.error ?? "No pude cargar las ramas") }))
      .catch(() => setBranches({ repo: repo.fullName, list: [], error: "No pude cargar las ramas" }));
  }

  function openRepos() {
    setDir("forward");
    setQuery("");
    setSheet("repos");
    if (!repos) {
      fetch("/api/github/repos", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { connected: false, repos: [] }))
        .then(setRepos)
        .catch(() => setRepos({ connected: false, repos: [] }));
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setSheet(null);
    setFileError(null);
    try {
      const read = await Promise.all([...list].slice(0, 10 - files.length).map(readFile));
      setFiles((all) => [...all, ...read]);
    } catch (err) {
      setFileError((err as Error).message);
    }
  }

  function start() {
    const value = text.trim();
    if (!value || props.starting || !current) return;
    props.onStart({ text: value, files, repo, branch, ask });
  }

  const [dir, setDir] = useState<"forward" | "back">("forward");
  const sheetOpen = (name: typeof sheet) => ({ open: sheet === name, onOpenChange: (o: boolean) => setSheet(o ? name : null) });
  const pagesOpen = (...names: (typeof sheet)[]) => ({ open: names.includes(sheet), onOpenChange: (o: boolean) => !o && setSheet(null) });
  const go = (name: typeof sheet, to: "forward" | "back" = "forward") => {
    setDir(to);
    setSheet(name);
  };

  return (
    <div className={styles.newSessionScreen}>
      {props.onBack && (
        <button type="button" className={styles.roundBack} onClick={props.onBack} aria-label="Ver sesiones">
          <ChevronLeft size={22} />
        </button>
      )}

      <div className={styles.hero}>
        <AxoLaptop size={72} className={styles.axo} />
        <h1>
          {greeting()}, {props.userName.split(" ")[0]}
        </h1>
      </div>

      <div className={styles.startDock}>
        <div className={styles.pills}>
          <button type="button" className={styles.pill} onClick={() => setSheet("env")}>
            <Cloud size={18} aria-hidden="true" />
            {envLabel(current)}
          </button>
          {repo ? (
            <Menu.Root>
              <Menu.Trigger className={styles.pill}>
                <Github size={18} aria-hidden="true" />
                <span className={styles.pillText}>
                  {repo.fullName.split("/")[1]} · {branch ?? repo.defaultBranch}
                </span>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className={`menu ${styles.repoMenu}`} side="top" align="start" sideOffset={8}>
                  <Menu.Item className="menu-item" onSelect={openRepos}>
                    <Github size={16} aria-hidden="true" />
                    Cambiar repositorio
                  </Menu.Item>
                  <Menu.Item className="menu-item" onSelect={openBranches}>
                    <GitBranch size={16} aria-hidden="true" />
                    Cambiar rama
                  </Menu.Item>
                  <Menu.Item
                    className="menu-item"
                    onSelect={() => {
                      setRepo(null);
                      setBranch(null);
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                    Quitar repositorio
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          ) : (
            <button type="button" className={styles.pill} onClick={openRepos}>
              <Github size={18} aria-hidden="true" />
              Agregar repositorio
            </button>
          )}
        </div>

        <div className={styles.startBox}>
          {files.length > 0 && (
            <ul className={styles.startFiles}>
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  {f.mime.startsWith("image/") ? <ImageIcon size={13} /> : <FileText size={13} />}
                  <span>{f.name}</span>
                  <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="sr-only" htmlFor="code-start-input">
            Describe la tarea
          </label>
          <textarea
            id="code-start-input"
            className={styles.startInput}
            rows={1}
            value={text}
            placeholder="Describe una tarea o haz una pregunta…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                start();
              }
            }}
          />
          <div className={styles.startBar}>
            <button type="button" className={styles.roundIcon} onClick={() => go("context")} aria-label="Agregar contexto">
              <Plus size={20} />
            </button>
            <button type="button" className={styles.modelPill} onClick={() => go("model")}>
              {props.model?.label ?? "Modelo"}
              {props.variant && <span>{VARIANT_LABEL[props.variant] ?? props.variant}</span>}
            </button>
            <span className={styles.spacer} />
            {dictation.supported && (
              <button
                type="button"
                className={styles.roundIcon}
                aria-pressed={dictation.listening}
                aria-label={dictation.listening ? "Dejar de dictar" : "Dictar por voz"}
                onClick={dictation.toggle}
              >
                <Mic size={18} />
              </button>
            )}
            <button type="button" className={styles.sendRound} onClick={start} disabled={!text.trim() || props.starting || !current} aria-label="Empezar">
              {props.starting ? <Loader2 size={18} className={styles.spin} /> : <ArrowUp size={20} />}
            </button>
          </div>
        </div>
        {(fileError || props.error) && (
          <p className={styles.error} role="alert">
            {fileError ?? props.error}
          </p>
        )}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e.target.files)} />
      <input ref={photosRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      <input ref={filesRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />

      <Sheet
        {...sheetOpen("env")}
        title="Elegir entorno"
        action={
          <button type="button" className={styles.sheetAction} onClick={() => setHelp((v) => !v)} aria-label="Qué es un entorno" aria-pressed={help}>
            <HelpCircle size={20} />
          </button>
        }
      >
        {help && (
          <p className={styles.sheetHelp}>
            El entorno es donde trabaja el agente. En la nube cada sesión tiene su propio contenedor con su disco: se apaga solo cuando no lo
            usas y al volver sigue todo ahí. Cada entorno define el acceso a internet, las variables y un script que corre al iniciar. También
            puedes conectar un nexocode que corra en tu computadora.
          </p>
        )}
        {props.environments.some((e) => e.cloud) && <p className={styles.sheetSection}>Entornos en la nube</p>}
        <div className={styles.sheetGroup}>
          {props.environments
            .filter((e) => e.cloud)
            .map((e) => (
              <button
                key={e.id}
                type="button"
                className={styles.sheetRow}
                onClick={() => {
                  props.onEnvironment(e.id);
                  setSheet(null);
                }}
              >
                <Cloud size={20} aria-hidden="true" />
                <span className={styles.sheetRowText}>{e.name}</span>
                {e.id === props.environment && <Check size={20} className={styles.check} aria-label="Elegido" />}
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.rowEdit}
                  aria-label={`Editar ${e.name}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSheet(null);
                    props.onEditEnvironment(e.id);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key !== "Enter" && ev.key !== " ") return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    setSheet(null);
                    props.onEditEnvironment(e.id);
                  }}
                >
                  <Pencil size={16} />
                </span>
              </button>
            ))}
        </div>
        {props.environments.some((e) => !e.cloud) && <p className={styles.sheetSection}>Tus servidores</p>}
        <div className={styles.sheetGroup}>
          {props.environments
            .filter((e) => !e.cloud)
            .map((e) => (
              <button
                key={e.id}
                type="button"
                className={styles.sheetRow}
                onClick={() => {
                  props.onEnvironment(e.id);
                  setSheet(null);
                }}
              >
                <Server size={20} aria-hidden="true" />
                <span className={styles.sheetRowText}>{e.name}</span>
                {e.id === props.environment && <Check size={20} className={styles.check} aria-label="Elegido" />}
              </button>
            ))}
        </div>
        <button
          type="button"
          className={`${styles.sheetRow} ${styles.sheetRowSolo}`}
          onClick={() => {
            setSheet(null);
            props.onCreateEnvironment();
          }}
        >
          <Plus size={22} aria-hidden="true" />
          <span className={styles.sheetRowText}>Crear entorno</span>
        </button>
      </Sheet>

      <Sheet
        {...pagesOpen("repos", "connect")}
        title={sheet === "connect" ? "Conectar repositorios" : `Repositorios (${repo ? 1 : 0})`}
        onBack={sheet === "connect" ? () => go("repos", "back") : undefined}
        page={sheet === "connect" ? "connect" : "repos"}
        dir={dir}
      >
        {sheet === "connect" ? (
          <div className={styles.connect}>
            <div className={styles.connectArt} aria-hidden="true">
              <Axo size={36} />
              {(repos?.repos.length ? repos.repos.slice(0, 3).map((r) => r.fullName) : ["tu-usuario/mi-app", "tu-usuario/api", "tu-org/web"]).map((name) => (
                <span key={name}>
                  <Github size={14} />
                  {name}
                </span>
              ))}
            </div>
            <h2>Conecta tus repositorios</h2>
            <p>Instala la app de GitHub de Nexo en tus repositorios para que el agente pueda clonarlos, hacer commits y abrir pull requests.</p>
            <a className={styles.connectBtn} href="/api/github/connect?to=install">
              <ExternalLink size={18} aria-hidden="true" />
              Conectar repositorios
            </a>
          </div>
        ) : !repos ? (
          <p className={styles.sheetHelp}>
            <Loader2 size={16} className={styles.spin} /> Cargando tus repos…
          </p>
        ) : !repos.connected ? (
          <div className={styles.sheetEmpty}>
            <Github size={28} aria-hidden="true" />
            <p>Conecta tu cuenta de GitHub para que el agente pueda clonar tus repos, hacer commits y abrir pull requests.</p>
            <a className="btn btn-primary" href="/settings?tab=github">
              Conectar GitHub
            </a>
          </div>
        ) : (
          <>
            {repo && (
              <>
                <p className={styles.sheetSection}>Seleccionados</p>
                <div className={styles.sheetGroup}>
                  <button type="button" className={styles.repoRow} onClick={() => setSheet(null)}>
                    <small>{repo.fullName.split("/")[0]}</small>
                    <span>{repo.fullName.split("/")[1]}</span>
                    <Check size={18} className={styles.check} aria-label="Elegido" />
                  </button>
                </div>
              </>
            )}
            <p className={styles.sheetSection}>Repositorios</p>
            <div className={`${styles.repoList} ${styles.repoListTight}`}>
              {shown.map((r) => {
                const [owner, name] = r.fullName.split("/");
                return (
                  <button key={r.fullName} type="button" className={styles.repoRow} onClick={() => pickRepo(r)}>
                    <small>{owner}</small>
                    <span>{name}</span>
                  </button>
                );
              })}
              {!shown.length && <p className={styles.sheetHelp}>{query ? `Ningún repo coincide con "${query}".` : "No hay más repos compartidos con Nexo."}</p>}
            </div>
            <button type="button" className={`${styles.sheetRow} ${styles.sheetRowSolo} ${styles.connectRow}`} onClick={() => go("connect")}>
              <span className={styles.sheetRowText}>Conectar más repositorios</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <label className={styles.repoSearch}>
              <Search size={20} aria-hidden="true" />
              <span className="sr-only">Buscar repos</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" />
            </label>
          </>
        )}
      </Sheet>

      <Sheet {...sheetOpen("branches")} title="Ramas">
        {!branches?.list ? (
          <p className={styles.sheetHelp}>
            <Loader2 size={16} className={styles.spin} /> Cargando las ramas…
          </p>
        ) : (
          <>
            {branches.error && <p className={styles.error}>{branches.error}</p>}
            <div className={styles.repoList}>
              {shownBranches.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={styles.repoRow}
                  onClick={() => {
                    setBranch(b === repo?.defaultBranch ? null : b);
                    setSheet(null);
                  }}
                >
                  {b === repo?.defaultBranch && <small>Por defecto</small>}
                  <span className={styles.branchName}>{b}</span>
                  {(branch ?? repo?.defaultBranch) === b && <Check size={18} className={styles.check} aria-label="Elegida" />}
                </button>
              ))}
              {!shownBranches.length && !branches.error && <p className={styles.sheetHelp}>Ninguna rama coincide con &quot;{branchQuery}&quot;.</p>}
            </div>
            <label className={styles.repoSearch}>
              <Search size={20} aria-hidden="true" />
              <span className="sr-only">Buscar ramas</span>
              <input value={branchQuery} onChange={(e) => setBranchQuery(e.target.value)} placeholder="Buscar" />
            </label>
          </>
        )}
      </Sheet>

      <Sheet
        {...pagesOpen("model", "effort")}
        title={sheet === "effort" ? "Esfuerzo" : "Seleccionar modelo"}
        onBack={sheet === "effort" ? () => go("model", "back") : undefined}
        page={sheet === "effort" ? "effort" : "model"}
        dir={dir}
      >
        {sheet === "effort" ? (
          <>
            <div className={styles.sheetGroup}>
              {[null, ...variants].map((v) => (
                <button
                  key={v ?? "default"}
                  type="button"
                  className={styles.sheetRow}
                  onClick={() => {
                    props.onVariant(v);
                    go("model", "back");
                  }}
                >
                  <span className={styles.sheetRowText}>{v ? (VARIANT_LABEL[v] ?? v) : "Normal"}</span>
                  {props.variant === v && <Check size={20} className={styles.check} aria-label="Elegido" />}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className={styles.sheetGroup}>
              {props.models.map((m) => (
                <button
                  key={`${m.providerID}/${m.modelID}`}
                  type="button"
                  className={styles.sheetRow}
                  onClick={() => {
                    props.onModel(m);
                    if (!m.variants?.includes(props.variant ?? "")) props.onVariant(null);
                    setSheet(null);
                  }}
                >
                  <span className={styles.sheetRowText}>
                    {m.label}
                    <small>{m.provider}</small>
                  </span>
                  {props.model?.modelID === m.modelID && props.model.providerID === m.providerID && (
                    <Check size={20} className={styles.check} aria-label="Elegido" />
                  )}
                </button>
              ))}
            </div>
            {variants.length > 0 && (
              <button type="button" className={`${styles.sheetRow} ${styles.sheetRowSolo}`} onClick={() => go("effort")}>
                <span className={styles.sheetRowText}>Esfuerzo</span>
                <span className={styles.sheetValue}>{props.variant ? (VARIANT_LABEL[props.variant] ?? props.variant) : "Normal"}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </Sheet>

      <Sheet
        {...pagesOpen("context", "permission")}
        title={sheet === "permission" ? "Permiso" : "Agregar contexto"}
        onBack={sheet === "permission" ? () => go("context", "back") : undefined}
        page={sheet === "permission" ? "permission" : "context"}
        dir={dir}
      >
        {sheet === "permission" ? (
          <>
            <div className={styles.sheetGroup}>
              {[
                { value: false, label: "Auto", hint: "El agente edita archivos y corre comandos sin pedirte permiso." },
                { value: true, label: "Preguntar", hint: "Te pide permiso antes de correr comandos, editar archivos o leer páginas web." },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={styles.sheetRow}
                  onClick={() => {
                    setAsk(o.value);
                    go("context", "back");
                  }}
                >
                  <span className={styles.sheetRowText}>
                    {o.label}
                    <small>{o.hint}</small>
                  </span>
                  {ask === o.value && <Check size={20} className={styles.check} aria-label="Elegido" />}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className={styles.tiles}>
              <button type="button" onClick={() => cameraRef.current?.click()}>
                <Camera size={24} aria-hidden="true" />
                Cámara
              </button>
              <button type="button" onClick={() => photosRef.current?.click()}>
                <ImageIcon size={24} aria-hidden="true" />
                Fotos
              </button>
              <button type="button" onClick={() => filesRef.current?.click()}>
                <FileUp size={24} aria-hidden="true" />
                Archivos
              </button>
            </div>
            <button type="button" className={`${styles.sheetRow} ${styles.sheetRowSolo}`} onClick={() => go("permission")}>
              <Shield size={20} aria-hidden="true" />
              <span className={styles.sheetRowText}>Permiso</span>
              <span className={styles.sheetValue}>{ask ? "Preguntar" : "Auto"}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <a className={`${styles.sheetRow} ${styles.sheetRowSolo}`} href="/settings?tab=github">
              <Blocks size={20} aria-hidden="true" />
              <span className={styles.sheetRowText}>Conectores</span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
          </>
        )}
      </Sheet>
    </div>
  );
}
