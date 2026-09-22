"use client";

import { useState } from "react";
import type { WidgetOf } from "@/lib/widgets";
import styles from "./widgets.module.css";

type Quiz = WidgetOf<"quiz">;

function Questions({ quiz }: { quiz: Quiz }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const q = quiz.questions[index];
  const choice = picked[index];
  const answered = choice !== undefined;
  const right = choice === q.answer;
  const score = Object.entries(picked).filter(([i, c]) => quiz.questions[Number(i)].answer === c).length;
  const done = Object.keys(picked).length === quiz.questions.length;

  return (
    <>
      <h3 className={styles.question}>{q.question}</h3>
      <div className={styles.options} role="radiogroup" aria-label="Opciones">
        {q.options.map((o, i) => {
          const state = !answered ? undefined : i === choice && !right ? "wrong" : i === q.answer ? "right" : "dim";
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={choice === i}
              className={styles.option}
              data-state={state}
              disabled={answered}
              onClick={() => setPicked((p) => ({ ...p, [index]: i }))}
            >
              <span className={styles.radio} aria-hidden="true" />
              {o}
              {state === "wrong" && (
                <span className={styles.badge} data-kind="bad">
                  Incorrecto
                </span>
              )}
              {state === "right" && (
                <span className={styles.badge} data-kind="ok">
                  Correcto
                </span>
              )}
            </button>
          );
        })}
      </div>
      {answered && (
        <p className={styles.explanation}>
          <b>{right ? "¡Bien!" : "Casi."}</b> {q.explanation ?? `La respuesta es: ${q.options[q.answer]}.`}
        </p>
      )}
      <div className={styles.row}>
        <div className={styles.dots} role="group" aria-label="Preguntas">
          {quiz.questions.map((_, i) => (
            <button
              key={i}
              type="button"
              className={styles.dot}
              aria-current={i === index ? "step" : undefined}
              aria-label={`Pregunta ${i + 1}`}
              onClick={() => setIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <span className={styles.spacer} />
        {done && <span className={styles.muted}>{`${score} de ${quiz.questions.length} correctas`}</span>}
        {index < quiz.questions.length - 1 ? (
          <button type="button" className={styles.btnLight} disabled={!answered} onClick={() => setIndex(index + 1)}>
            Siguiente
          </button>
        ) : (
          <button
            type="button"
            className={styles.btn}
            disabled={!done}
            onClick={() => {
              setPicked({});
              setIndex(0);
            }}
          >
            Reintentar
          </button>
        )}
      </div>
    </>
  );
}

function Cards({ quiz }: { quiz: Quiz }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const q = quiz.questions[index];
  const go = (i: number) => {
    setIndex(i);
    setFlipped(false);
  };
  return (
    <>
      <button type="button" className={styles.flashcard} onClick={() => setFlipped((f) => !f)} aria-label="Voltear tarjeta">
        <span>
          <strong>{flipped ? q.options[q.answer] : q.question}</strong>
          <small>{flipped ? (q.explanation ?? "Toca para ver la pregunta") : "Toca para ver la respuesta"}</small>
        </span>
      </button>
      <div className={styles.row}>
        <span className={styles.muted}>
          {index + 1} / {quiz.questions.length}
        </span>
        <span className={styles.spacer} />
        <button type="button" className={styles.btn} disabled={index === 0} onClick={() => go(index - 1)}>
          Atrás
        </button>
        <button type="button" className={styles.btnLight} disabled={index === quiz.questions.length - 1} onClick={() => go(index + 1)}>
          Siguiente
        </button>
      </div>
    </>
  );
}

/**
 * Quiz de opción múltiple con modo de tarjetas para repasar.
 */
export function QuizWidget({ widget }: { widget: Quiz }) {
  const [mode, setMode] = useState<"quiz" | "cards">("quiz");
  return (
    <div className={styles.card}>
      <div className={styles.segmented} role="group" aria-label="Modo">
        <button type="button" aria-pressed={mode === "quiz"} onClick={() => setMode("quiz")}>
          Quiz
        </button>
        <button type="button" aria-pressed={mode === "cards"} onClick={() => setMode("cards")}>
          Tarjetas
        </button>
      </div>
      {widget.title && <p className={styles.muted}>{widget.title}</p>}
      {mode === "quiz" ? <Questions quiz={widget} /> : <Cards quiz={widget} />}
    </div>
  );
}
