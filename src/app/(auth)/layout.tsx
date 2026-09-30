import { NexoLogo } from "@/components/brand/logo";
import styles from "./auth.module.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <aside className={styles.poster} aria-hidden="true">
        <div className={styles.grid} />
        <p className={styles.mark}>
          <NexoLogo size={34} />
        </p>
        <p className={styles.models}>Claude, GPT o cualquier API compatible con OpenAI, con tus conectores MCP.</p>
        <p className={styles.quote}>
          Un solo lugar para
          <br />
          <em>pensar en voz alta</em>
          <br />
          con cualquier modelo.
        </p>
      </aside>
      <main className={styles.panel}>{children}</main>
    </div>
  );
}
