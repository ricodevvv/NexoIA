"use client";

import { useState } from "react";
import { CodeBlock } from "../chat/code-block";
import { Segmented } from "../ui/segmented";
import { buildSnippet, type SnippetInput, type SnippetLang } from "@/lib/platform/snippets";

const LANGS: { value: SnippetLang; label: string; shiki: string }[] = [
  { value: "curl", label: "curl", shiki: "bash" },
  { value: "python", label: "Python", shiki: "python" },
  { value: "typescript", label: "TypeScript", shiki: "typescript" },
];

/**
 * El mismo ejemplo en curl, Python y TypeScript, con selector y botón de
 * copiar.
 */
export function CodeTabs({ input, initial = "curl" }: { input: SnippetInput; initial?: SnippetLang }) {
  const [lang, setLang] = useState<SnippetLang>(initial);
  const current = LANGS.find((l) => l.value === lang)!;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Segmented value={lang} onChange={setLang} label="Lenguaje del ejemplo" options={LANGS.map((l) => ({ value: l.value, label: l.label }))} />
      <CodeBlock code={buildSnippet(lang, input)} lang={current.shiki} />
    </div>
  );
}
