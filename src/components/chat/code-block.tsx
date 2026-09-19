"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./chat.module.css";

type Highlighter = (code: string, lang: string) => Promise<string>;

let highlighter: Promise<Highlighter> | null = null;

function loadHighlighter() {
  highlighter ??= import("shiki").then(({ codeToHtml, bundledLanguages }) => async (code: string, lang: string) => {
    const language = lang in bundledLanguages ? lang : "text";
    return codeToHtml(code, {
      lang: language,
      themes: { light: "github-light", dark: "github-dark-dimmed" },
      defaultColor: false,
    });
  });
  return highlighter;
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={done ? "Copiado" : label}
      title={done ? "Copiado" : label}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Copy />}
    </button>
  );
}

/**
 * Bloque de código con resaltado de Shiki. Mientras llega el stream se
 * resalta con un pequeño retraso para no recalcular en cada token.
 */
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      const highlight = await loadHighlighter();
      const out = await highlight(code, lang);
      if (alive) setHtml(out);
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [code, lang]);

  return (
    <div className={styles.code}>
      <div className={styles.codeHeader}>
        <span className="label">{lang || "texto"}</span>
        <CopyButton text={code} label="Copiar código" />
      </div>
      {html ? (
        <div className={styles.codeBody} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className={styles.codeBody}>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
