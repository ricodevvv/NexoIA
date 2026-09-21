"use client";

import { Loader2, Plus, Search, Server, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Section } from "./settings";
import styles from "./settings.module.css";

type Endpoint = { id: string; name: string; baseUrl: string; models: string[]; hasKey: boolean };

const PRESETS = [
  { name: "NVIDIA", url: "https://integrate.api.nvidia.com/v1" },
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { name: "Groq", url: "https://api.groq.com/openai/v1" },
  { name: "DeepSeek", url: "https://api.deepseek.com/v1" },
];

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Algo salió mal");
  return data;
}

function ModelChooser({ available, selected, onToggle }: { available: string[]; selected: string[]; onToggle: (id: string) => void }) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? available.filter((m) => m.toLowerCase().includes(q)) : available;
  }, [available, filter]);
  return (
    <div className={styles.chooser}>
      <label className={styles.chooserSearch}>
        <Search size={13} aria-hidden="true" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filtrar ${available.length} modelos…`} aria-label="Filtrar modelos" />
      </label>
      <ul>
        {shown.map((m) => (
          <li key={m}>
            <label>
              <input type="checkbox" checked={selected.includes(m)} onChange={() => onToggle(m)} />
              <span>{m}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="hint">Nada coincide.</li>}
      </ul>
    </div>
  );
}

/**
 * Endpoints compatibles con OpenAI que agrega cada usuario (NVIDIA, OpenRouter,
 * Groq, un servidor propio...). Solo los ve y los usa quien los agregó.
 */
export function Endpoints({ endpoints }: { endpoints: Endpoint[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [available, setAvailable] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; available: string[]; selected: string[] } | null>(null);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((m) => m !== id) : [...list, id];
  }

  async function detect() {
    setBusy("detect");
    setError(null);
    try {
      const { models } = await call("/api/endpoints/detect", { method: "POST", body: JSON.stringify({ baseUrl, apiKey: apiKey || undefined }) });
      setAvailable(models);
      if (!models.length) setError("El endpoint no devolvió modelos. Escríbelos a mano.");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const models = [...selected, ...manual.split(",").map((m) => m.trim()).filter(Boolean)];
    if (!models.length) {
      setError("Elige o escribe al menos un modelo.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      await call("/api/endpoints", { method: "POST", body: JSON.stringify({ name, baseUrl, apiKey: apiKey || undefined, models }) });
      setName("");
      setBaseUrl("");
      setApiKey("");
      setAvailable(null);
      setSelected([]);
      setManual("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  }

  async function openEditor(ep: Endpoint) {
    setBusy(ep.id);
    setError(null);
    try {
      const { models } = await call("/api/endpoints/detect", { method: "POST", body: JSON.stringify({ id: ep.id }) });
      setEditing({ id: ep.id, available: [...new Set([...ep.models, ...models])], selected: ep.models });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function saveModels() {
    if (!editing) return;
    await call(`/api/endpoints/${editing.id}`, { method: "PATCH", body: JSON.stringify({ models: editing.selected }) });
    setEditing(null);
    router.refresh();
  }

  async function removeModel(ep: Endpoint, model: string) {
    await call(`/api/endpoints/${ep.id}`, { method: "PATCH", body: JSON.stringify({ models: ep.models.filter((m) => m !== model) }) });
    router.refresh();
  }

  async function remove(id: string) {
    await call(`/api/endpoints/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Section
      title="Endpoints propios"
      description="Cualquier API compatible con OpenAI: NVIDIA, OpenRouter, Groq, DeepSeek o un servidor tuyo. Sus modelos aparecen en el selector, solo para ti."
    >
      {endpoints.length > 0 && (
        <div className={styles.rows}>
          {endpoints.map((ep) => (
            <div key={ep.id} className={styles.row}>
              <div className={styles.rowHead}>
                <strong className={styles.connectorName}>
                  <Server size={14} aria-hidden="true" /> {ep.name}
                  {ep.hasKey && <span className="tag">key guardada</span>}
                </strong>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => remove(ep.id)}>
                  <Trash2 size={12} /> Quitar
                </button>
              </div>
              <code className={styles.url}>{ep.baseUrl}</code>
              <div className={styles.modelTags}>
                {ep.models.map((m) => (
                  <span key={m} className="tag">
                    {m}
                    <button onClick={() => removeModel(ep, m)} aria-label={`Quitar ${m}`}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              {editing?.id === ep.id ? (
                <>
                  <ModelChooser
                    available={editing.available}
                    selected={editing.selected}
                    onToggle={(m) => setEditing({ ...editing, selected: toggle(editing.selected, m) })}
                  />
                  <div className={styles.rowActions}>
                    <button className="btn btn-sm" onClick={() => setEditing(null)}>
                      Cancelar
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={saveModels}>
                      Guardar {editing.selected.length} modelos
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.rowActions}>
                  <button className="btn btn-sm" onClick={() => openEditor(ep)} disabled={busy === ep.id}>
                    {busy === ep.id ? <Loader2 size={12} className={styles.spin} /> : <Plus size={12} />} Elegir modelos
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form className={styles.stack} onSubmit={save}>
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setName(p.name);
                setBaseUrl(p.url);
                setAvailable(null);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className={styles.grid2}>
          <label className="field">
            <span>Nombre</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder="NVIDIA" />
          </label>
          <label className="field">
            <span>URL base</span>
            <input
              className="input"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              required
              placeholder="https://integrate.api.nvidia.com/v1"
            />
          </label>
        </div>
        <label className="field">
          <span>API key</span>
          <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="nvapi-…" />
          <small className="hint">Se guarda cifrada. Déjala vacía si el endpoint no pide key.</small>
        </label>
        <div>
          <button type="button" className="btn" onClick={detect} disabled={!baseUrl || busy === "detect"} aria-busy={busy === "detect"}>
            {busy === "detect" ? <Loader2 size={13} className={styles.spin} /> : <Search size={13} />} Detectar modelos
          </button>
        </div>
        {available && available.length > 0 && (
          <ModelChooser available={available} selected={selected} onToggle={(m) => setSelected(toggle(selected, m))} />
        )}
        <label className="field">
          <span>Otros modelos (opcional)</span>
          <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="z-ai/glm-5.3, openai/gpt-oss-20b" />
          <small className="hint">Separados por coma, por si el endpoint no lista sus modelos.</small>
        </label>
        {error && <p className="error-text">{error}</p>}
        <div>
          <button className="btn btn-primary" disabled={busy === "save"} aria-busy={busy === "save"}>
            Agregar endpoint{selected.length ? ` con ${selected.length} modelos` : ""}
          </button>
        </div>
      </form>
    </Section>
  );
}
