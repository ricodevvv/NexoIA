"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import type { WidgetOf } from "@/lib/widgets";
import styles from "./widgets.module.css";

/**
 * Pasos de un procedimiento, de uno en uno o todos juntos.
 */
export function StepsWidget({ widget }: { widget: WidgetOf<"steps"> }) {
  const [index, setIndex] = useState(0);
  const [all, setAll] = useState(false);
  const steps = widget.steps;
  const step = steps[index];
  const last = index === steps.length - 1;

  if (all) {
    return (
      <div className={styles.card}>
        {widget.title && <h3 className={styles.title}>{widget.title}</h3>}
        <ol className={styles.stepList}>
          {steps.map((s, i) => (
            <li key={i}>
              <span className={styles.num}>{i + 1}</span>
              <div>
                <h4>{s.title}</h4>
                <p>{s.description}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={() => setAll(false)}>
            Ver paso a paso
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div>
        <h3 className={styles.bigTitle}>{step.title}</h3>
        <p className={styles.muted}>{step.description}</p>
      </div>
      <div className={styles.row}>
        <div className={styles.dots} role="group" aria-label="Pasos">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              className={styles.dot}
              aria-current={i === index ? "step" : undefined}
              aria-label={`Paso ${i + 1}`}
              onClick={() => setIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {index === 0 && (
          <button type="button" className={styles.btn} onClick={() => setAll(true)}>
            Ver todos los pasos
          </button>
        )}
        <span className={styles.spacer} />
        {index > 0 && !last && (
          <button type="button" className={styles.btn} onClick={() => setIndex(index - 1)}>
            Atrás
          </button>
        )}
        {last ? (
          <button type="button" className={styles.btn} onClick={() => setIndex(0)}>
            <RotateCcw size={14} /> Empezar de nuevo
          </button>
        ) : (
          <button type="button" className={styles.btnLight} onClick={() => setIndex(index + 1)}>
            Siguiente
          </button>
        )}
      </div>
    </div>
  );
}
