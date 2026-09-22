"use client";

import { parseWidget } from "@/lib/widgets";
import { ChartWidget } from "./chart";
import { DiagramWidget } from "./diagram";
import { ComparisonWidget, LinksWidget, WeatherWidget } from "./info";
import { QuizWidget } from "./quiz";
import { RecipeWidget } from "./recipe";
import { StepsWidget } from "./steps";
import styles from "./widgets.module.css";

/**
 * Pinta el widget que pidió el modelo. Mientras llega el input muestra un
 * hueco; si el input no es válido no pinta nada (el error queda en la tool).
 */
export function Widget({ input, pending }: { input: unknown; pending: boolean }) {
  if (pending) return <div className={`${styles.card} ${styles.skeleton}`}>Preparando widget…</div>;
  const parsed = parseWidget(input);
  if (!parsed.ok) return null;
  const w = parsed.widget;
  switch (w.type) {
    case "chart":
      return <ChartWidget widget={w} />;
    case "steps":
      return <StepsWidget widget={w} />;
    case "quiz":
      return <QuizWidget widget={w} />;
    case "comparison":
      return <ComparisonWidget widget={w} />;
    case "links":
      return <LinksWidget widget={w} />;
    case "recipe":
      return <RecipeWidget widget={w} />;
    case "weather":
      return <WeatherWidget widget={w} />;
    case "diagram":
      return <DiagramWidget widget={w} />;
  }
}
