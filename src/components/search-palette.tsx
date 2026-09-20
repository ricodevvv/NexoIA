"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { FolderClosed, Loader2, MessageSquare, Search, Settings, SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./search-palette.module.css";

type Result = { id: string; title: string; updatedAt: string; snippet: string | null };

type Item = { key: string; label: string; hint?: string; snippet?: string | null; icon: React.ReactNode; href: string };

const SHORTCUTS: Item[] = [
  { key: "new", label: "Nuevo chat", icon: <SquarePen size={15} />, href: "/" },
  { key: "projects", label: "Proyectos", icon: <FolderClosed size={15} />, href: "/projects" },
  { key: "settings", label: "Ajustes", icon: <Settings size={15} />, href: "/settings" },
];

function Highlight({ text, query }: { text: string; query: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

/**
 * Paleta de búsqueda con Ctrl/Cmd+K: busca en títulos y contenido de todos los
 * chats, y da atajos a las secciones principales.
 */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: Result[]) => {
          setResults(data);
          setActive(0);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const searching = query.trim().length >= 2;
  const items: Item[] = searching
    ? results.map((r) => ({
        key: r.id,
        label: r.title,
        snippet: r.snippet,
        hint: new Date(r.updatedAt).toLocaleDateString("es", { day: "2-digit", month: "short" }),
        icon: <MessageSquare size={15} />,
        href: `/chat/${r.id}`,
      }))
    : SHORTCUTS;

  function go(item: Item | undefined) {
    if (!item) return;
    onOpenChange(false);
    setQuery("");
    setResults([]);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(items.length, 1);
      setActive(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={styles.palette} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Buscar en tus chats</Dialog.Title>
          <div className={styles.inputRow}>
            {loading ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar en todos tus chats…"
              aria-label="Buscar"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              aria-activedescendant={items[active] ? `palette-${items[active].key}` : undefined}
            />
            <kbd>Esc</kbd>
          </div>
          <p className={`label ${styles.section}`}>{searching ? `Resultados · ${results.length}` : "Ir a"}</p>
          <ul id="palette-results" ref={listRef} className={styles.results} role="listbox">
            {items.map((item, i) => (
              <li
                key={item.key}
                id={`palette-${item.key}`}
                role="option"
                aria-selected={i === active}
                className={styles.item}
                onMouseMove={() => setActive(i)}
                onClick={() => go(item)}
              >
                <span className={styles.icon}>{item.icon}</span>
                <span className={styles.text}>
                  <span className={styles.itemTitle}>
                    <Highlight text={item.label} query={query.trim()} />
                  </span>
                  {item.snippet && (
                    <span className={styles.snippet}>
                      <Highlight text={item.snippet} query={query.trim()} />
                    </span>
                  )}
                </span>
                {item.hint && <span className="label">{item.hint}</span>}
              </li>
            ))}
            {searching && !loading && results.length === 0 && <li className={styles.empty}>Nada coincide con “{query.trim()}”.</li>}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
