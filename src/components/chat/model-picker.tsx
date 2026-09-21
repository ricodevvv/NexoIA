"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import type { Effort, ProviderId } from "@/lib/ai/types";
import styles from "./chat.module.css";

export type ModelOption = {
  id: string;
  provider: ProviderId;
  label: string;
  description: string;
  tier: "free" | "pro";
  available: boolean;
  byok: boolean;
  reasoning: boolean;
  webSearch: boolean;
  vision: boolean;
  pdf: boolean;
  group?: string;
};

const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  compat: "Compatibles",
};

export const EFFORT_LABEL: Record<Effort, string> = { low: "Bajo", medium: "Medio", high: "Alto" };

const EFFORT_HINT: Record<Effort, string> = {
  low: "Respuestas rápidas, piensa poco",
  medium: "Equilibrio entre velocidad y calidad",
  high: "Piensa más antes de responder",
};

/**
 * Selector de modelo y esfuerzo, como texto discreto debajo del composer.
 */
export function ModelPicker({
  models,
  value,
  plan,
  onChange,
  effort,
  onEffort,
}: {
  models: ModelOption[];
  value: string;
  plan: "free" | "pro";
  onChange: (id: string) => void;
  effort: Effort;
  onEffort: (e: Effort) => void;
}) {
  const current = models.find((m) => m.id === value);
  const groupOf = (m: ModelOption) => m.group ?? PROVIDER_LABEL[m.provider];
  const groups = [...new Set(models.map(groupOf))];

  return (
    <Menu.Root>
      <Menu.Trigger className={styles.modelTrigger} aria-label="Modelo y esfuerzo">
        <span className={styles.modelTriggerName}>{current?.label ?? "Elige un modelo"}</span>
        {current?.reasoning && <span className={styles.modelTriggerEffort}>{EFFORT_LABEL[effort]}</span>}
        <ChevronDown size={13} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={`menu ${styles.modelMenu}`} side="top" align="end" sideOffset={8}>
          {groups.map((group, i) => (
            <Menu.Group key={group}>
              {i > 0 && <Menu.Separator className="menu-sep" />}
              <Menu.Label className="menu-label label">{group}</Menu.Label>
              {models
                .filter((m) => groupOf(m) === group)
                .map((m) => {
                  const locked = m.tier === "pro" && plan !== "pro" && !m.byok;
                  return (
                    <Menu.Item key={m.id} className={`menu-item ${styles.modelItem}`} disabled={!m.available} onSelect={() => onChange(m.id)}>
                      <span className={styles.modelText}>
                        <span className={styles.modelName}>
                          {m.label}
                          {m.tier === "pro" && <span className={`tag ${locked ? "" : "tag-accent"}`}>Pro</span>}
                        </span>
                        <span className={styles.modelDesc}>{m.available ? m.description : "Sin API key configurada"}</span>
                      </span>
                      {m.id === value && <Check size={16} aria-label="Seleccionado" />}
                    </Menu.Item>
                  );
                })}
            </Menu.Group>
          ))}
          {current?.reasoning && (
            <>
              <Menu.Separator className="menu-sep" />
              <Menu.Label className="menu-label label">Esfuerzo</Menu.Label>
              <Menu.RadioGroup value={effort} onValueChange={(v) => onEffort(v as Effort)}>
                {(Object.keys(EFFORT_LABEL) as Effort[]).map((e) => (
                  <Menu.RadioItem key={e} className={`menu-item ${styles.modelItem}`} value={e}>
                    <span className={styles.modelText}>
                      <span className={styles.modelName}>{EFFORT_LABEL[e]}</span>
                      <span className={styles.modelDesc}>{EFFORT_HINT[e]}</span>
                    </span>
                    <Menu.ItemIndicator>
                      <Check size={16} />
                    </Menu.ItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
