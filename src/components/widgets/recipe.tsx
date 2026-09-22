"use client";

import { Check, Copy, Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { WidgetOf } from "@/lib/widgets";
import styles from "./widgets.module.css";

type Recipe = WidgetOf<"recipe">;

function amount(value: number | undefined, factor: number) {
  if (value === undefined) return "";
  const n = value * factor;
  return String(Number(n.toFixed(n < 10 ? 2 : 0)));
}

function asText(recipe: Recipe, factor: number, servings: number) {
  const lines = [`${recipe.title} (${servings} porciones)`, "", "Ingredientes:"];
  for (const i of recipe.ingredients) lines.push(`- ${[amount(i.amount, factor), i.unit, i.name].filter(Boolean).join(" ")}`);
  lines.push("", "Pasos:");
  recipe.steps.forEach((s, n) => lines.push(`${n + 1}. ${s.title ? `${s.title}: ` : ""}${s.text}`));
  return lines.join("\n");
}

/**
 * Receta con porciones ajustables y modo de cocinar paso a paso.
 */
export function RecipeWidget({ widget }: { widget: Recipe }) {
  const [servings, setServings] = useState(widget.servings);
  const [cooking, setCooking] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const factor = servings / widget.servings;

  if (cooking !== null) {
    const step = widget.steps[cooking];
    const last = cooking === widget.steps.length - 1;
    return (
      <div className={styles.card}>
        <p className={styles.muted}>
          {widget.title} · paso {cooking + 1} de {widget.steps.length}
        </p>
        <h3 className={styles.bigTitle}>{step.title ?? `Paso ${cooking + 1}`}</h3>
        <p className={styles.explanation}>{step.text}</p>
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={() => setCooking(null)}>
            Salir
          </button>
          <span className={styles.spacer} />
          <button type="button" className={styles.btn} disabled={cooking === 0} onClick={() => setCooking(cooking - 1)}>
            Atrás
          </button>
          <button type="button" className={styles.btnLight} onClick={() => setCooking(last ? null : cooking + 1)}>
            {last ? "Terminar" : "Siguiente"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      {widget.images && widget.images.length > 0 && (
        <div className={styles.images}>
          {widget.images.map((img) => (
            <figure key={img.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              {img.credit && <figcaption>{img.credit}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      <div>
        <h3 className={styles.bigTitle}>{widget.title}</h3>
        {widget.description && <p className={styles.muted}>{widget.description}</p>}
      </div>
      <div className={styles.row}>
        <span className={styles.servings}>
          <button type="button" className={styles.iconBtn} aria-label="Menos porciones" disabled={servings <= 1} onClick={() => setServings(servings - 1)}>
            <Minus size={14} />
          </button>
          <b>{servings}</b>
          <button type="button" className={styles.iconBtn} aria-label="Más porciones" onClick={() => setServings(servings + 1)}>
            <Plus size={14} />
          </button>
          porciones
        </span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Copiar receta"
          onClick={async () => {
            await navigator.clipboard.writeText(asText(widget, factor, servings));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button type="button" className={styles.btnLight} onClick={() => setCooking(0)}>
          Comenzar a cocinar
        </button>
      </div>
      <h4 className={styles.section}>Ingredientes</h4>
      <ul className={styles.ingredients}>
        {widget.ingredients.map((i, n) => (
          <li key={n}>
            <b>{[amount(i.amount, factor), i.unit].filter(Boolean).join(" ")}</b> {i.name}
          </li>
        ))}
      </ul>
      <h4 className={styles.section}>Pasos</h4>
      <ol className={styles.stepList}>
        {widget.steps.map((s, n) => (
          <li key={n}>
            <span className={styles.num}>{n + 1}</span>
            <p>
              {s.title && <b>{s.title}: </b>}
              {s.text}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
