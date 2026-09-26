"use client";

import { Check, ChevronRight, Circle, FastForward, X } from "lucide-react";
import { useState } from "react";
import type { SetupStep, StepStatus } from "@/lib/code-setup";
import { Spinner } from "../chat/activity";
import chat from "../chat/chat.module.css";
import { Sheet } from "./sheet";
import styles from "./code.module.css";

export type SetupSteps = Partial<Record<SetupStep, StepStatus>>;

type Props = { steps: SetupSteps; repo: string | null; cloud: boolean };

function order(repo: string | null): SetupStep[] {
  return repo ? ["container", "clone", "script", "agent"] : ["container", "script", "agent"];
}

function stepTitle(step: SetupStep, status: StepStatus, cloud: boolean) {
  const done = status === "done";
  if (step === "container") {
    if (cloud) return "Configurar un contenedor en la nube";
    return done ? "Conectado con el servidor" : "Conectar con el servidor";
  }
  if (step === "clone") return done ? "Se clonó 1 repositorio" : "Clonar 1 repositorio";
  if (step === "script") return done ? "Se ejecutó el script de configuración" : "Ejecutar script de configuración";
  return done ? "Nexo Code iniciado" : "Iniciar Nexo Code";
}

function runningText(step: SetupStep, cloud: boolean) {
  if (step === "container") return cloud ? "Configurando un contenedor en la nube" : "Conectando con el servidor";
  if (step === "clone") return "Clonando 1 repositorio";
  if (step === "script") return "Ejecutando script de configuración";
  return "Iniciando Nexo Code";
}

function runningDetail(step: SetupStep, repo: string | null, cloud: boolean) {
  if (step === "container") return cloud ? "Preparando tu espacio" : "Esperando respuesta";
  if (step === "clone") return `Clonando ${repo}`;
  if (step === "script") return "Corriendo el script del entorno";
  return "Arrancando el agente";
}

/**
 * La fila de arranque de una sesión, como en Claude Code en la web: mientras
 * se prepara dice por qué paso va, y al terminar queda como "Sesión
 * inicializada". Al tocarla abre la lista de pasos.
 */
export function SetupRow({ steps, repo, cloud }: Props) {
  const [open, setOpen] = useState(false);
  const list = order(repo);
  const failed = list.find((s) => steps[s] === "error");
  const running = failed ? undefined : list.find((s) => steps[s] !== "done" && steps[s] !== "skipped");
  const label = failed ? "No se pudo iniciar la sesión" : running ? runningText(running, cloud) : "Sesión inicializada";

  return (
    <div className={styles.setup}>
      <button type="button" className={styles.setupRow} data-state={failed ? "error" : running ? "running" : "done"} onClick={() => setOpen(true)}>
        <span className={running ? chat.shimmer : undefined}>{label}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {running && (
        <div className={styles.setupLive} role="status">
          <Spinner />
          <span>{runningDetail(running, repo, cloud)}</span>
        </div>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        <ol className={styles.setupSteps}>
          {list.map((step) => {
            const status = steps[step] ?? "pending";
            return (
              <li key={step} data-status={status}>
                {status === "done" ? (
                  <Check size={18} aria-label="Listo" />
                ) : status === "error" ? (
                  <X size={18} aria-label="Falló" />
                ) : status === "skipped" ? (
                  <FastForward size={18} aria-label="Omitido" />
                ) : status === "running" ? (
                  <Spinner />
                ) : (
                  <Circle size={16} aria-label="Pendiente" />
                )}
                <span>
                  {stepTitle(step, status, cloud)}
                  {step === "clone" && repo && <small>{repo}</small>}
                </span>
              </li>
            );
          })}
        </ol>
      </Sheet>
    </div>
  );
}
