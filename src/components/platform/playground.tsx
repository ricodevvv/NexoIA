"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Bot, Code2, Columns2, Copy, CornerDownLeft, Loader2, Plus, Save, Sparkles, Square, Trash2, User, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Effort } from "@/lib/ai/types";
import { fillVariables, promptVariables } from "@/lib/platform/prompt-text";
import type { PromptView } from "@/lib/platform/prompts";
import { Markdown } from "../chat/markdown";
import type { ModelOption } from "../chat/model-picker";
import { EFFORT_LABEL } from "../chat/model-picker";
import { PageHeader } from "../ui/page-header";
import { Segmented } from "../ui/segmented";
import { formatCost, formatLatency, formatNumber } from "../ui/format";
import { useToast } from "../ui/toast";
import { CodeTabs } from "./code-tabs";
import styles from "./playground.module.css";

type Role = "user" | "assistant";
type Turn = { id: string; role: Role; content: string };
type Output = {
  text: string;
  reasoning: string;
  status: "idle" | "running" | "done" | "error";
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs?: number;
  cost?: number | null;
  truncated?: boolean;
};

type Props = {
  models: ModelOption[];
  prompts: PromptView[];
  initialPrompt: PromptView | null;
  initialModel: string;
  baseUrl: string;
};

const EMPTY: Output = { text: "", reasoning: "", status: "idle" };

function newTurn(role: Role, content = ""): Turn {
  return { id: crypto.randomUUID(), role, content };
}

/**
 * Playground para probar prompts como en un workbench: system prompt,
 * mensajes editables, variables, comparación lado a lado entre dos modelos,
 * métricas de cada corrida y el código equivalente para la API.
 */
export function Playground({ models, prompts, initialPrompt, initialModel, baseUrl }: Props) {
  const toast = useToast();
  const [model, setModel] = useState(initialModel);
  const [compare, setCompare] = useState("");
  const [effort, setEffort] = useState<Effort>("medium");
  const [maxTokens, setMaxTokens] = useState(4096);
  const [system, setSystem] = useState(initialPrompt?.system ?? "");
  const [turns, setTurns] = useState<Turn[]>([newTurn("user", initialPrompt?.content ?? "")]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [outputs, setOutputs] = useState<Output[]>([EMPTY, EMPTY]);
  const [codeOpen, setCodeOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const controllers = useRef<AbortController[]>([]);

  useEffect(() => () => controllers.current.forEach((c) => c.abort()), []);

  const current = models.find((m) => m.id === model);
  const efforts = current?.efforts ?? [];
  const variables = useMemo(() => promptVariables(system, ...turns.map((t) => t.content)), [system, turns]);
  const slots = compare ? [model, compare] : [model];
  const running = outputs.some((o) => o.status === "running");
  const groups = useMemo(() => {
    const map = new Map<string, ModelOption[]>();
    for (const m of models) {
      const key = m.group ?? ({ anthropic: "Anthropic", openai: "OpenAI", compat: "Compatibles" } as const)[m.provider];
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()];
  }, [models]);

  const filled = {
    system: fillVariables(system, values),
    messages: turns.filter((t) => t.content.trim()).map((t) => ({ role: t.role, content: fillVariables(t.content, values) })),
  };
  const canRun = Boolean(model) && filled.messages.length > 0 && filled.messages[0].role === "user" && filled.messages.at(-1)?.role === "user";

  function update(id: string, patch: Partial<Turn>) {
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function loadPrompt(id: string) {
    const p = prompts.find((x) => x.id === id);
    if (!p) return;
    setSystem(p.system);
    setTurns([newTurn("user", p.content)]);
    setValues({});
    if (p.model && models.some((m) => m.id === p.model)) setModel(p.model);
    fetch(`/api/platform/prompts/${p.id}`, { method: "POST" }).catch(() => {});
    toast(`Cargaste “${p.name}”`, "info");
  }

  async function runSlot(index: number, modelId: string, signal: AbortSignal) {
    const set = (fn: (o: Output) => Output) => setOutputs((all) => all.map((o, i) => (i === index ? fn(o) : o)));
    set(() => ({ ...EMPTY, status: "running" }));
    try {
      const res = await fetch("/api/platform/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ model: modelId, system: filled.system, messages: filled.messages, effort, maxTokens }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        set((o) => ({ ...o, status: "error", error: data.error ?? "No se pudo correr el prompt" }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") set((o) => ({ ...o, text: o.text + ev.delta }));
          else if (ev.type === "reasoning") set((o) => ({ ...o, reasoning: o.reasoning + ev.delta }));
          else if (ev.type === "error") set((o) => ({ ...o, error: ev.message }));
          else if (ev.type === "done")
            set((o) => ({ ...o, status: o.error ? "error" : "done", usage: ev.usage, latencyMs: ev.latencyMs, cost: ev.cost, truncated: ev.truncated }));
        }
      }
      set((o) => (o.status === "running" ? { ...o, status: "done" } : o));
    } catch (err) {
      set((o) => ({ ...o, status: (err as Error).name === "AbortError" ? "done" : "error", error: (err as Error).name === "AbortError" ? undefined : "Se perdió la conexión" }));
    }
  }

  function run() {
    if (!canRun || running) return;
    controllers.current.forEach((c) => c.abort());
    controllers.current = slots.map(() => new AbortController());
    setOutputs([EMPTY, EMPTY]);
    slots.forEach((m, i) => runSlot(i, m, controllers.current[i].signal));
  }

  function stop() {
    controllers.current.forEach((c) => c.abort());
  }

  function keepAnswer(index: number) {
    const text = outputs[index].text;
    if (!text) return;
    setTurns((all) => [...all, newTurn("assistant", text), newTurn("user")]);
    setOutputs([EMPTY, EMPTY]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const lastUser = [...turns].reverse().find((t) => t.role === "user" && t.content.trim());
    const res = await fetch("/api/platform/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(data.get("name")).trim(),
        description: String(data.get("description") ?? "").trim(),
        system,
        content: lastUser?.content ?? "",
        model,
        tags: String(data.get("tags") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    if (res.ok) {
      setSaveOpen(false);
      toast("Prompt guardado en tu biblioteca");
    } else {
      const body = await res.json().catch(() => ({}));
      toast(body.error ?? "No se pudo guardar", "error");
    }
  }

  return (
    <div className="page" onKeyDown={onKeyDown}>
      <div className="page-inner" style={{ maxWidth: 1400, width: "100%" }}>
        <PageHeader
          eyebrow="Plataforma"
          title="Playground"
          description="Prueba prompts contra cualquier modelo, compara respuestas y llévate el código."
          actions={
            <>
              <button type="button" className="btn" onClick={() => setCodeOpen(true)} disabled={!model}>
                <Code2 size={15} aria-hidden="true" /> Ver código
              </button>
              <button type="button" className="btn" onClick={() => setSaveOpen(true)} disabled={!turns.some((t) => t.role === "user" && t.content.trim())}>
                <Save size={15} aria-hidden="true" /> Guardar prompt
              </button>
            </>
          }
        />

        {!models.length && (
          <p className="callout" data-tone="warning" style={{ marginBottom: 16 }}>
            <Sparkles aria-hidden="true" />
            <span>No tienes modelos disponibles. Agrega una API key de proveedor en Ajustes → Modelos para empezar.</span>
          </p>
        )}

        <div className={styles.layout}>
          <aside className={`card ${styles.config}`} aria-label="Configuración">
            <div className="card-body stack">
              <label className="field">
                <span>Modelo</span>
                <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
                  {groups.map(([group, list]) => (
                    <optgroup key={group} label={group}>
                      {list.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className={styles.labelRow}>
                  <Columns2 size={14} aria-hidden="true" /> Comparar con
                </span>
                <select className="select" value={compare} onChange={(e) => setCompare(e.target.value)}>
                  <option value="">Ninguno</option>
                  {models
                    .filter((m) => m.id !== model)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </label>
              {efforts.length > 0 && (
                <div className="field">
                  <span id="esfuerzo-label">Esfuerzo de razonamiento</span>
                  <Segmented
                    value={efforts.includes(effort) ? effort : efforts.at(-1)!}
                    onChange={setEffort}
                    label="Esfuerzo de razonamiento"
                    options={efforts.map((e) => ({ value: e, label: EFFORT_LABEL[e] }))}
                  />
                </div>
              )}
              <label className="field">
                <span>Máximo de tokens de salida</span>
                <input
                  className="input"
                  type="number"
                  min={16}
                  max={128000}
                  step={256}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Math.max(16, Number(e.target.value) || 16))}
                />
              </label>
              {prompts.length > 0 && (
                <label className="field">
                  <span>Cargar de la biblioteca</span>
                  <select className="select" value="" onChange={(e) => loadPrompt(e.target.value)}>
                    <option value="">Elige un prompt…</option>
                    {prompts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {variables.length > 0 && (
                <fieldset className={styles.variables}>
                  <legend>Variables</legend>
                  {variables.map((v) => (
                    <label key={v} className="field">
                      <span>
                        <code className="code-inline">{`{{${v}}}`}</code>
                      </span>
                      <input className="input" value={values[v] ?? ""} onChange={(e) => setValues((all) => ({ ...all, [v]: e.target.value }))} />
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          </aside>

          <div className={styles.main}>
            <section className="card" aria-label="Prompt">
              <div className={styles.system}>
                <label htmlFor="pg-system" className={styles.roleLabel}>
                  <Sparkles size={14} aria-hidden="true" /> System
                </label>
                <textarea
                  id="pg-system"
                  className={styles.text}
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  rows={3}
                  placeholder="Eres un asistente experto en… Responde siempre en español y en menos de 200 palabras."
                />
              </div>
              {turns.map((t, i) => (
                <div key={t.id} className={styles.turn} data-role={t.role}>
                  <div className={styles.turnHead}>
                    <button
                      type="button"
                      className={styles.roleToggle}
                      onClick={() => update(t.id, { role: t.role === "user" ? "assistant" : "user" })}
                      aria-label={`Rol: ${t.role === "user" ? "usuario" : "asistente"}. Cambiar`}
                    >
                      {t.role === "user" ? <User size={14} aria-hidden="true" /> : <Bot size={14} aria-hidden="true" />}
                      {t.role === "user" ? "Usuario" : "Asistente"}
                    </button>
                    {turns.length > 1 && (
                      <button type="button" className="icon-btn" onClick={() => setTurns((all) => all.filter((x) => x.id !== t.id))} aria-label="Quitar mensaje">
                        <Trash2 />
                      </button>
                    )}
                  </div>
                  <textarea
                    className={styles.text}
                    value={t.content}
                    onChange={(e) => update(t.id, { content: e.target.value })}
                    rows={i === turns.length - 1 ? 5 : 3}
                    aria-label={`Mensaje ${i + 1}`}
                    placeholder={t.role === "user" ? "Escribe el mensaje del usuario. Usa {{variable}} para partes que cambian." : "Respuesta de ejemplo del asistente"}
                  />
                </div>
              ))}
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setTurns((all) => [...all, newTurn(all.at(-1)?.role === "user" ? "assistant" : "user")])}
                >
                  <Plus size={14} aria-hidden="true" /> Agregar mensaje
                </button>
                <span className="spacer" />
                {running ? (
                  <button type="button" className="btn btn-primary" onClick={stop}>
                    <Square size={12} fill="currentColor" aria-hidden="true" /> Detener
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={run} disabled={!canRun}>
                    Ejecutar <kbd className={styles.kbdOnDark}>Ctrl ↵</kbd>
                  </button>
                )}
              </div>
            </section>

            <div className={styles.outputs} data-count={slots.length}>
              {slots.map((m, i) => {
                const out = outputs[i];
                const info = models.find((x) => x.id === m);
                return (
                  <section key={`${m}-${i}`} className={`card ${styles.output}`} aria-label={`Respuesta de ${info?.label ?? m}`} aria-busy={out.status === "running"}>
                    <div className="card-head">
                      <h2 className="card-title">{info?.label ?? m}</h2>
                      <span className="spacer" />
                      {out.status === "running" && <Loader2 size={15} className="spin" aria-label="Generando" />}
                      {out.text && out.status !== "running" && (
                        <>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigator.clipboard.writeText(out.text)}>
                            <Copy size={13} aria-hidden="true" /> Copiar
                          </button>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => keepAnswer(i)}>
                            <CornerDownLeft size={13} aria-hidden="true" /> Seguir la conversación
                          </button>
                        </>
                      )}
                    </div>
                    <div className="card-body">
                      {out.reasoning && (
                        <details className={styles.reasoning}>
                          <summary>Razonamiento</summary>
                          <p>{out.reasoning}</p>
                        </details>
                      )}
                      {out.text ? (
                        <Markdown text={out.text} />
                      ) : out.status === "idle" ? (
                        <p className={styles.placeholder}>La respuesta aparece aquí. Usa Ctrl + Enter para ejecutar.</p>
                      ) : out.status === "running" ? (
                        <div className="stack" style={{ gap: 8 }}>
                          <span className="skeleton" style={{ height: 12, width: "80%" }} />
                          <span className="skeleton" style={{ height: 12, width: "65%" }} />
                          <span className="skeleton" style={{ height: 12, width: "72%" }} />
                        </div>
                      ) : null}
                      {out.error && (
                        <p className="callout" data-tone="danger" style={{ marginTop: 10 }}>
                          <X aria-hidden="true" />
                          <span>{out.error}</span>
                        </p>
                      )}
                    </div>
                    {out.usage && (
                      <div className="card-foot">
                        <span>
                          {formatNumber(out.usage.inputTokens)} entrada · {formatNumber(out.usage.outputTokens)} salida
                        </span>
                        <span>·</span>
                        <span>{formatLatency(out.latencyMs)}</span>
                        <span>·</span>
                        <span>{formatCost(out.cost)}</span>
                        {out.truncated && <span className="tag tag-warning">Cortada por límite</span>}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Dialog.Root open={codeOpen} onOpenChange={setCodeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog dialog-xl">
            <Dialog.Title>Código para la API</Dialog.Title>
            <Dialog.Description className="muted">Hace la misma petición con tu API key de Nexo en la variable NEXO_API_KEY.</Dialog.Description>
            <div style={{ marginTop: 16 }}>
              <CodeTabs
                input={{
                  baseUrl,
                  model,
                  system: filled.system,
                  messages: filled.messages.length ? filled.messages : [{ role: "user", content: "Hola" }],
                  maxTokens,
                  effort: efforts.length ? effort : undefined,
                }}
              />
            </div>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Cerrar</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={saveOpen} onOpenChange={setSaveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Guardar en la biblioteca</Dialog.Title>
            <Dialog.Description className="muted">Se guardan el system prompt, el último mensaje del usuario y el modelo.</Dialog.Description>
            <form className="stack" style={{ marginTop: 16 }} onSubmit={save}>
              <label className="field">
                <span>Nombre</span>
                <input className="input" name="name" required maxLength={80} autoFocus placeholder="Resumen ejecutivo" />
              </label>
              <label className="field">
                <span>Descripción</span>
                <input className="input" name="description" maxLength={300} placeholder="Para qué sirve" />
              </label>
              <label className="field">
                <span>Etiquetas</span>
                <input className="input" name="tags" placeholder="ventas, resumen" />
                <small className="hint">Separadas por comas.</small>
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
    </div>
  );
}
