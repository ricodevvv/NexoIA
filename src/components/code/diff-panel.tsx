"use client";

import { ChevronDown, ChevronRight, FileMinus, FilePen, FilePlus, RotateCw, X } from "lucide-react";
import { useState } from "react";
import { DiffView } from "./code-tools";
import styles from "./code.module.css";

export type FileDiff = { file: string; patch: string; additions: number; deletions: number; status: "added" | "modified" | "deleted" };

const ICON = { added: FilePlus, modified: FilePen, deleted: FileMinus };

function FileRow({ diff }: { diff: FileDiff }) {
  const [open, setOpen] = useState(false);
  const Icon = ICON[diff.status] ?? FilePen;
  return (
    <li className={styles.diffFile}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <Icon size={15} aria-hidden="true" data-status={diff.status} />
        <span className={styles.diffName} title={diff.file}>
          {diff.file}
        </span>
        <span className={styles.plus}>+{diff.additions}</span>
        <span className={styles.minus}>−{diff.deletions}</span>
      </button>
      {open && <DiffView patch={diff.patch} />}
    </li>
  );
}

/**
 * Panel con los archivos que cambiaron en el proyecto (git) y su diff.
 */
export function DiffPanel({ files, loading, onRefresh, onClose }: { files: FileDiff[]; loading: boolean; onRefresh: () => void; onClose: () => void }) {
  const added = files.reduce((n, f) => n + f.additions, 0);
  const removed = files.reduce((n, f) => n + f.deletions, 0);
  return (
    <aside className={styles.diffPanel} aria-label="Cambios">
      <header className={styles.diffHead}>
        <h2>Cambios</h2>
        {files.length > 0 && (
          <span className={styles.diffTotals}>
            {files.length} {files.length === 1 ? "archivo" : "archivos"} · <span className={styles.plus}>+{added}</span>{" "}
            <span className={styles.minus}>−{removed}</span>
          </span>
        )}
        <span className={styles.spacer} />
        <button className="icon-btn" onClick={onRefresh} aria-label="Actualizar cambios" title="Actualizar">
          <RotateCw className={loading ? styles.spin : undefined} />
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar cambios" title="Cerrar">
          <X />
        </button>
      </header>
      {files.length === 0 ? (
        <p className={styles.muted}>No hay cambios sin guardar en el repositorio.</p>
      ) : (
        <ul className={styles.diffList}>
          {files.map((f) => (
            <FileRow key={f.file} diff={f} />
          ))}
        </ul>
      )}
    </aside>
  );
}
