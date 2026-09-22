"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Code2, Download, Eye, Maximize2, Minimize2, RotateCw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CodeBlock } from "../chat/code-block";
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

function Preview({ artifact, reloads }: { artifact: ArtifactVersion; reloads: number }) {
  const dark = useIsDark();
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
  const [reloads, setReloads] = useState(0);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const view = previewable ? tab : "code";
  const ext = fileName(artifact).split(".").pop()?.toUpperCase();

  async function copy() {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <aside className={styles.panel} data-expanded={expanded || undefined} aria-label={`Artifact: ${artifact.title}`}>
      <header className={styles.header}>
        {previewable && (
          <div className={styles.segmented} role="tablist">
            <button role="tab" aria-selected={view === "preview"} aria-label="Vista previa" title="Vista previa" onClick={() => setTab("preview")}>
              <Eye size={17} />
            </button>
            <button role="tab" aria-selected={view === "code"} aria-label="Código" title="Código" onClick={() => setTab("code")}>
              <Code2 size={17} />
            </button>
          </div>
        )}
        <h2 className={styles.title}>
          <span className={styles.titleName}>{artifact.title}</span>
          <span className={styles.titleExt}>
            {" "}
            · {ext}
            {versions.length > 1 ? ` · v${selected + 1}` : ""}
          </span>
        </h2>
        <div className={styles.split}>
          <button type="button" onClick={copy} aria-label="Copiar contenido">
            {copied ? "Copiado" : "Copiar"}
          </button>
          <Menu.Root>
            <Menu.Trigger className={styles.splitMore} aria-label="Más acciones">
              <ChevronDown size={15} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="menu" align="end" sideOffset={6}>
                <Menu.Item className="menu-item" onSelect={() => download(artifact)}>
                  <Download /> Descargar {fileName(artifact)}
                </Menu.Item>
                {view === "preview" && artifact.type !== "markdown" && (
                  <Menu.Item className="menu-item" onSelect={() => setReloads((n) => n + 1)}>
                    <RotateCw /> Recargar vista previa
                  </Menu.Item>
                )}
                {versions.length > 1 && (
                  <>
                    <Menu.Separator className="menu-sep" />
                    <p className="menu-label label">Versiones</p>
                    {versions.map((_, i) => (
                      <Menu.Item key={i} className="menu-item" onSelect={() => onSelect(i)}>
                        <span className={styles.grow}>
                          Versión {i + 1}
                          {i === versions.length - 1 ? " · última" : ""}
                        </span>
                        {i === selected && <Check />}
                      </Menu.Item>
                    ))}
                  </>
                )}
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
        <button
          className={`icon-btn ${styles.expand}`}
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Salir de pantalla completa" : "Pantalla completa"}
          title={expanded ? "Salir de pantalla completa" : "Pantalla completa"}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar artifact" title="Cerrar">
          <X />
        </button>
      </header>

      <div className={styles.body}>
        {view === "preview" ? (
          <Preview artifact={artifact} reloads={reloads} />
        ) : (
          <div className={styles.codeView}>
            <CodeBlock code={artifact.content} lang={codeLanguage(artifact)} numbered />
          </div>
        )}
      </div>
    </aside>
  );
}
