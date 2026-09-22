"use client";

import { Globe } from "lucide-react";
import type { WidgetOf } from "@/lib/widgets";
import { ExternalLink } from "../external-link";
import styles from "./widgets.module.css";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Comparación lado a lado de varias opciones con los mismos atributos. En
 * pantallas angostas cada opción va en su propio bloque, una debajo de otra.
 */
export function ComparisonWidget({ widget }: { widget: WidgetOf<"comparison"> }) {
  const labels = [...new Set(widget.items.flatMap((i) => i.rows.map((r) => r.label)))];
  return (
    <div className={styles.card}>
      <div className={styles.compare} style={{ gridTemplateColumns: `repeat(${widget.items.length}, minmax(150px, 1fr))` }}>
        {widget.items.map((item) => (
          <div key={item.name} className={styles.compareHead}>
            {item.name}
          </div>
        ))}
        {labels.flatMap((label) =>
          widget.items.map((item) => (
            <div key={`${label}-${item.name}`} className={styles.compareCell}>
              <small>{label}</small>
              <span>{item.rows.find((r) => r.label === label)?.value ?? "—"}</span>
            </div>
          )),
        )}
      </div>
      <div className={styles.compareStack}>
        {widget.items.map((item) => (
          <section key={item.name}>
            <h4>{item.name}</h4>
            <dl>
              {labels.map((label) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{item.rows.find((r) => r.label === label)?.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * Tarjetas de enlaces recomendados. Abren con la confirmación de enlace externo.
 */
export function LinksWidget({ widget }: { widget: WidgetOf<"links"> }) {
  return (
    <div className={styles.links}>
      {widget.title && <h3 className={styles.title}>{widget.title}</h3>}
      {widget.links.map((l) => (
        <ExternalLink key={l.url} href={l.url} className={styles.link}>
          <strong>{l.title}</strong>
          {l.description && <span>{l.description}</span>}
          <small>
            <Globe size={12} aria-hidden="true" /> {hostOf(l.url)}
          </small>
        </ExternalLink>
      ))}
    </div>
  );
}

/**
 * Tarjeta de clima con la temperatura actual y el pronóstico por día.
 */
export function WeatherWidget({ widget }: { widget: WidgetOf<"weather"> }) {
  const deg = (n: number) => `${Math.round(n)}°`;
  return (
    <div className={`${styles.card} ${styles.weather}`}>
      <div className={styles.weatherTop}>
        <div>
          <small>{widget.location}</small>
          <p className={styles.temp}>{deg(widget.temperature)}</p>
        </div>
        <div className={styles.weatherSide}>
          <span>{widget.condition}</span>
          {widget.source && <small>{widget.source}</small>}
        </div>
      </div>
      {widget.days && widget.days.length > 0 && (
        <div className={styles.days}>
          {widget.days.map((d, i) => (
            <div key={i}>
              <span>{d.day}</span>
              <b>{deg(d.max)}</b>
              {d.rain !== undefined && <span>{d.rain}%</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
