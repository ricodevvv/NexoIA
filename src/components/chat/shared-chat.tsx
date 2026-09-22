"use client";

import Link from "next/link";
import { useArtifactViewer } from "../artifacts/use-artifact-viewer";
import { NexoLogo } from "../brand/logo";
import { ExternalLinkDialog } from "../external-link";
import { Message, MessageContext, type UIMessage } from "./message";
import styles from "./chat.module.css";

type Props = {
  shareId: string;
  title: string;
  createdAt: string;
  messages: UIMessage[];
  labels: Record<string, string>;
};

/**
 * Vista pública de solo lectura de un chat compartido.
 */
export function SharedChat({ shareId, title, createdAt, messages, labels }: Props) {
  const viewer = useArtifactViewer(messages);

  return (
    <MessageContext.Provider value={{ attachmentUrl: (id) => `/api/share/${shareId}/files/${id}`, ...viewer.context }}>
      <div className={styles.sharedPage}>
        <ExternalLinkDialog />
        <div className={styles.layout} data-artifact={Boolean(viewer.panel)}>
          <div className={styles.chat}>
            <header className={styles.sharedHeader}>
              <Link href="/" className={styles.sharedBrand} aria-label="Nexo">
                <NexoLogo size={22} />
              </Link>
              <span className="tag">Chat compartido</span>
            </header>
            <div className={styles.scroll}>
              <div className={styles.thread}>
                <div className={styles.sharedIntro}>
                  <h1>{title}</h1>
                  <p className="label">
                    Copia del {new Date(createdAt).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                {messages.map((m, i) => (
                  <Message
                    key={m.id}
                    message={m}
                    live={false}
                    isLast={i === messages.length - 1}
                    busy={false}
                    modelLabel={m.model ? (labels[m.model] ?? m.model) : undefined}
                  />
                ))}
                <p className={styles.sharedFooter}>
                  ¿Quieres tu propia conversación? <Link href="/signup">Crea una cuenta en Nexo</Link>.
                </p>
              </div>
            </div>
          </div>
          {viewer.panel && <div className={styles.artifactSlot}>{viewer.panel}</div>}
        </div>
      </div>
    </MessageContext.Provider>
  );
}
