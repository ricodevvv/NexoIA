"use client";

import { Check, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import styles from "./code.module.css";

export type QuestionInfo = {
  question: string;
  header: string;
  options: { label: string; description?: string }[];
  multiple?: boolean;
  custom?: boolean;
};

export type QuestionRequest = { id: string; sessionID: string; questions: QuestionInfo[] };

type Answer = { picked: string[]; other: string | null };

function answerOf(a: Answer | undefined) {
  if (!a) return [];
  const other = a.other?.trim();
  return other ? [...a.picked, other] : a.picked;
}

/**
 * Menú para responder las preguntas que hace el agente: opciones numeradas
 * (se eligen con clic o con 1–9), "Otra…" para escribir la tuya y, si son
 * varias preguntas, se avanza de una en una.
 */
export function QuestionCard({ request, onAnswer, onSkip }: { request: QuestionRequest; onAnswer: (answers: string[][]) => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const q = request.questions[step];
  const current = answers[step] ?? { picked: [], other: null };
  const last = step === request.questions.length - 1;
  const ready = answerOf(current).length > 0;
  const allowOther = q.custom !== false;

  function set(next: Answer) {
    setAnswers((all) => ({ ...all, [step]: next }));
  }

  function pick(label: string) {
    if (q.multiple) {
      set({ ...current, picked: current.picked.includes(label) ? current.picked.filter((l) => l !== label) : [...current.picked, label] });
    } else {
      set({ picked: [label], other: null });
    }
  }

  function next() {
    if (!ready) return;
    if (last) onAnswer(request.questions.map((_, i) => answerOf(i === step ? current : answers[i])));
    else setStep(step + 1);
  }

  return (
    <div
      className={styles.question}
      role="group"
      aria-label={q.header || "Pregunta del agente"}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        const n = Number(e.key);
        if (n >= 1 && n <= q.options.length) {
          e.preventDefault();
          pick(q.options[n - 1].label);
        }
        if (e.key === "Enter") {
          e.preventDefault();
          next();
        }
      }}
    >
      <div className={styles.questionHead}>
        <MessageCircleQuestion size={17} aria-hidden="true" />
        {request.questions.length > 1 ? (
          <div className={styles.questionTabs} role="tablist">
            {request.questions.map((item, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === step}
                data-done={answerOf(answers[i]).length > 0 || undefined}
                onClick={() => setStep(i)}
              >
                {item.header || `Pregunta ${i + 1}`}
              </button>
            ))}
          </div>
        ) : (
          q.header && <span className={styles.questionChip}>{q.header}</span>
        )}
      </div>
      <p className={styles.questionText}>{q.question}</p>
      <div className={styles.questionOptions} role={q.multiple ? "group" : "radiogroup"}>
        {q.options.map((o, i) => {
          const on = current.picked.includes(o.label);
          return (
            <button
              key={o.label}
              type="button"
              role={q.multiple ? "checkbox" : "radio"}
              aria-checked={on}
              className={styles.questionOption}
              onClick={() => pick(o.label)}
              autoFocus={i === 0}
            >
              <span className={styles.questionKey} aria-hidden="true">
                {on ? <Check size={13} /> : i + 1}
              </span>
              <span className={styles.questionLabel}>
                <strong>{o.label}</strong>
                {o.description && <small>{o.description}</small>}
              </span>
            </button>
          );
        })}
        {allowOther && (
          <div className={styles.questionOption} data-other aria-checked={current.other !== null}>
            <span className={styles.questionKey} aria-hidden="true">
              …
            </span>
            {current.other === null ? (
              <button type="button" className={styles.questionOtherBtn} onClick={() => set({ picked: q.multiple ? current.picked : [], other: "" })}>
                Otra respuesta…
              </button>
            ) : (
              <input
                className={styles.questionInput}
                autoFocus
                value={current.other}
                placeholder="Escribe tu respuesta"
                aria-label="Tu respuesta"
                onChange={(e) => set({ ...current, other: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    next();
                  }
                }}
              />
            )}
          </div>
        )}
      </div>
      <div className={styles.questionActions}>
        {q.multiple && <span className={styles.muted}>Puedes elegir varias</span>}
        <span className={styles.spacer} />
        <button type="button" className="btn btn-sm" onClick={onSkip}>
          Omitir
        </button>
        {step > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => setStep(step - 1)}>
            Atrás
          </button>
        )}
        <button type="button" className="btn btn-sm btn-primary" disabled={!ready} onClick={next}>
          {last ? "Enviar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}

/**
 * Saca las respuestas del texto que devuelve la tool `question` de nexocode:
 * `User has answered your questions: "pregunta"="respuesta", ...`.
 */
export function parseAnswers(output: string) {
  const answers = new Map<string, string>();
  for (const m of output.matchAll(/"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g)) answers.set(m[1], m[2]);
  return answers;
}

/**
 * Lo que queda en el chat después de responderle al agente: cada pregunta
 * con la respuesta que diste, como tarjeta aparte del resto de la actividad.
 */
export function AnsweredQuestion({ input, output }: { input: unknown; output: string }) {
  const questions = ((input as { questions?: QuestionInfo[] } | null)?.questions ?? []).filter((q) => q?.question);
  const answers = parseAnswers(output);
  if (!questions.length) return null;
  return (
    <div className={styles.answered}>
      <p className={styles.answeredLabel}>{questions.length > 1 ? "Preguntas" : "Pregunta"}</p>
      {questions.map((q) => (
        <div key={q.question} className={styles.answeredItem}>
          <p className={styles.answeredQuestion}>{q.question}</p>
          <p className={styles.answeredAnswer}>{answers.get(q.question) ?? "Sin respuesta"}</p>
        </div>
      ))}
    </div>
  );
}
