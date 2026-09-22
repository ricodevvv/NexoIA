"use client";

import { Archive, Code2, FileText, Image as ImageIcon } from "lucide-react";
import styles from "./chat.module.css";

export type FileKind = "code" | "doc" | "archive" | "image" | "file";

const CODE_EXT = new Set(["js", "jsx", "ts", "tsx", "py", "java", "kt", "go", "rs", "rb", "php", "c", "cpp", "cs", "swift", "sql", "sh", "html", "css", "json", "yaml", "yml", "xml", "svg"]);

/**
 * Adivina qué icono le toca a un archivo por su extensión.
 */
export function kindOf(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (CODE_EXT.has(ext)) return "code";
  if (["zip", "tar", "gz", "rar", "7z", "jar"].includes(ext)) return "archive";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (["md", "txt", "pdf", "doc", "docx", "csv"].includes(ext)) return "doc";
  return "file";
}

const ICONS = { code: Code2, doc: FileText, archive: Archive, image: ImageIcon, file: FileText };

/**
 * Tarjeta de archivo con miniatura, título, tipo y botón de descargar.
 * Si trae `onOpen`, al tocarla se abre en el visor.
 */
export function FileCard({
  title,
  meta,
  kind,
  active,
  onOpen,
  onDownload,
  href,
  fileName,
}: {
  title: string;
  meta: string;
  kind: FileKind;
  active?: boolean;
  onOpen?: () => void;
  onDownload?: () => void;
  href?: string;
  fileName?: string;
}) {
  const Icon = ICONS[kind];
  const body = (
    <>
      <span className={styles.fileThumb} data-kind={kind} aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className={styles.fileCardText}>
        <span className={styles.fileCardTitle}>{title}</span>
        <span className={styles.fileCardMeta}>{meta}</span>
      </span>
    </>
  );
  return (
    <div className={styles.fileCard} data-active={active || undefined} data-kind={kind}>
      {onOpen ? (
        <button type="button" className={styles.fileCardMain} onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className={styles.fileCardMain}>{body}</div>
      )}
      {href ? (
        <a className={styles.fileCardDownload} href={href} download={fileName}>
          Descargar
        </a>
      ) : (
        <button type="button" className={styles.fileCardDownload} onClick={onDownload}>
          Descargar
        </button>
      )}
    </div>
  );
}
