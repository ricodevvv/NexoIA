"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import type { ProviderId } from "@/lib/ai/types";
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
};

const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  compat: "Compatibles",
};

export function ModelPicker({
  models,
  value,
  plan,
  onChange,
}: {
  models: ModelOption[];
  value: string;
  plan: "free" | "pro";
  onChange: (id: string) => void;
}) {
  const current = models.find((m) => m.id === value);
  const providers = [...new Set(models.map((m) => m.provider))];

  return (
    <Menu.Root>
      <Menu.Trigger className={styles.modelTrigger}>
        <span>{current?.label ?? "Elige un modelo"}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={`menu ${styles.modelMenu}`} side="top" align="end" sideOffset={8}>
          {providers.map((provider, i) => (
            <Menu.Group key={provider}>
              {i > 0 && <Menu.Separator className="menu-sep" />}
              <Menu.Label className="menu-label label">{PROVIDER_LABEL[provider]}</Menu.Label>
              {models
                .filter((m) => m.provider === provider)
                .map((m) => {
                  const locked = m.tier === "pro" && plan !== "pro" && !m.byok;
                  return (
                    <Menu.Item
                      key={m.id}
                      className={`menu-item ${styles.modelItem}`}
                      disabled={!m.available}
                      onSelect={() => onChange(m.id)}
                    >
                      <span className={styles.modelText}>
                        <span className={styles.modelName}>
                          {m.label}
                          {m.tier === "pro" && <span className={`tag ${locked ? "" : "tag-accent"}`}>Pro</span>}
                        </span>
                        <span className={styles.modelDesc}>
                          {m.available ? m.description : "Sin API key configurada"}
                        </span>
                      </span>
                      {m.id === value && <Check size={15} aria-label="Seleccionado" />}
                    </Menu.Item>
                  );
                })}
            </Menu.Group>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
