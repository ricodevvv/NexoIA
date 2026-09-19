"use client";

import { Download, RotateCw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CodeBlock, CopyButton } from "../chat/code-block";
import { Markdown } from "../chat/markdown";
import { useIsDark } from "../use-is-dark";
import { codeLanguage, fileName, hasPreview, type ArtifactVersion } from "./artifacts";
import { buildSrcDoc } from "./srcdoc";
import styles from "./artifacts.module.css";

type Props = {
  versions: ArtifactVersion[];
  selected: number;
  onSelect: (index: number) => void;
  onClose: () => void;
};

function download(artifact: ArtifactVersion) {
  const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(artifact);
  a.click();
  URL.revokeObjectURL(url);
}

function Preview({ artifact }: { artifact: ArtifactVersion }) {
  const dark = useIsDark();
  const [reloads, setReloads] = useState(0);
  const srcDoc = useMemo(() => buildSrcDoc(artifact, dark), [artifact, dark]);

  if (artifact.type === "markdown") {
    return (
      <div className={styles.doc}>
        <Markdown text={artifact.content} />
      </div>
    );
  }
  return (
    <div className={styles.frameWrap}>
      <iframe
        key={reloads}
        className={styles.frame}
        title={artifact.title}
        sandbox="allow-scripts allow-modals allow-forms allow-popups allow-downloads"
        srcDoc={srcDoc}
      />
      <button className={`icon-btn ${styles.reload}`} onClick={() => setReloads((n) => n + 1)} aria-label="Recargar vista previa" title="Recargar">
        <RotateCw />
      </button>
    </div>
  );
}

/**
 * Panel lateral que muestra un artifact con sus versiones, vista previa y
 * código.
 */
export function ArtifactPanel({ versions, selected, onSelect, onClose }: Props) {
  const artifact = versions[selected] ?? versions.at(-1)!;
  const previewable = hasPreview(artifact);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const view = previewable ? tab : "code";

  return (
    <aside className={styles.panel} aria-label={`Artifact: ${artifact.title}`}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className="label">{artifact.type}</span>
          <h2>{artifact.title}</h2>
        </div>
        <div className={styles.headerActions}>
          {versions.length > 1 && (
            <label className={styles.versions}>
              <span className="sr-only">Versión</span>
              <select value={selected} onChange={(e) => onSelect(Number(e.target.value))}>
                {versions.map((_, i) => (
                  <option key={i} value={i}>
                    v{i + 1}
                    {i === versions.length - 1 ? " · última" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <CopyButton text={artifact.content} label="Copiar contenido" />
          <button className="icon-btn" onClick={() => download(artifact)} aria-label="Descargar" title="Descargar">
            <Download />
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar artifact" title="Cerrar">
            <X />
          </button>
        </div>
      </header>

      {previewable && (
        <div className={styles.tabs} role="tablist">
          <button role="tab" aria-selected={view === "preview"} onClick={() => setTab("preview")}>
            Vista previa
          </button>
          <button role="tab" aria-selected={view === "code"} onClick={() => setTab("code")}>
            Código
          </button>
        </div>
      )}

      <div className={styles.body}>
        {view === "preview" ? (
          <Preview artifact={artifact} />
        ) : (
          <div className={styles.codeView}>
            <CodeBlock code={artifact.content} lang={codeLanguage(artifact)} />
          </div>
        )}
      </div>
    </aside>
  );
}
