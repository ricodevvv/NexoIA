"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Effort, ProviderId } from "@/lib/ai/types";
import { Sheet } from "../code/sheet";
import sheet from "../code/new-session.module.css";
import { useIsMobile } from "../use-is-mobile";
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
  efforts: Effort[];
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

export const EFFORT_LABEL: Record<Effort, string> = { low: "Bajo", medium: "Medio", high: "Alto", xhigh: "Extra", max: "Máx" };

const EFFORT_HINT: Record<Effort, string> = {
  low: "Respuestas rápidas, piensa poco",
  medium: "Equilibrio entre velocidad y calidad",
  high: "Piensa más antes de responder",
  xhigh: "Para código y tareas largas",
  max: "Lo más a fondo; tarda más y gasta más",
};

type Props = {
  models: ModelOption[];
  value: string;
  plan: "free" | "pro";
  onChange: (id: string) => void;
  effort: Effort;
  onEffort: (e: Effort) => void;
};

/**
 * El esfuerzo que se muestra para un modelo: el elegido si el modelo lo
 * acepta, o el más alto que sí acepta.
 */
function shownEffort(model: ModelOption | undefined, effort: Effort) {
  if (!model?.efforts.length) return null;
  return model.efforts.includes(effort) ? effort : model.efforts.at(-1)!;
}

/**
 * Selector de modelo y esfuerzo, como texto discreto debajo del composer. En
 * escritorio es un menú; en el celular, una hoja con páginas para el esfuerzo
 * y el resto de los modelos.
 */
export function ModelPicker(props: Props) {
  const mobile = useIsMobile();
  const current = props.models.find((m) => m.id === props.value);
  const level = shownEffort(current, props.effort);
  const trigger = (
    <>
      <span className={styles.modelTriggerName}>{current?.label ?? "Elige un modelo"}</span>
      {level && <span className={styles.modelTriggerEffort}>{EFFORT_LABEL[level]}</span>}
      <ChevronDown size={13} aria-hidden="true" />
    </>
  );
  return mobile ? <PickerSheet {...props} trigger={trigger} /> : <PickerMenu {...props} trigger={trigger} />;
}

function groupOf(m: ModelOption) {
  return m.group ?? PROVIDER_LABEL[m.provider];
}

function PickerMenu({ models, value, plan, onChange, effort, onEffort, trigger }: Props & { trigger: React.ReactNode }) {
  const current = models.find((m) => m.id === value);
  const level = shownEffort(current, effort);
  const groups = [...new Set(models.map(groupOf))];

  return (
    <Menu.Root>
      <Menu.Trigger className={styles.modelTrigger} aria-label="Modelo y esfuerzo">
        {trigger}
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
          {current && level && (
            <>
              <Menu.Separator className="menu-sep" />
              <Menu.Label className="menu-label label">Esfuerzo</Menu.Label>
              <Menu.RadioGroup value={level} onValueChange={(v) => onEffort(v as Effort)}>
                {current.efforts.map((e) => (
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

type Page = "models" | "effort" | "more";

function PickerSheet({ models, value, plan, onChange, effort, onEffort, trigger }: Props & { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>("models");
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const current = models.find((m) => m.id === value);
  const level = shownEffort(current, effort);
  const mainGroup = current ? groupOf(current) : models[0] ? groupOf(models[0]) : "";
  const main = models.filter((m) => groupOf(m) === mainGroup);
  const others = models.filter((m) => groupOf(m) !== mainGroup);
  const otherGroups = [...new Set(others.map(groupOf))];

  function go(to: Page, direction: "forward" | "back" = "forward") {
    setDir(direction);
    setPage(to);
  }

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  const row = (m: ModelOption) => {
    const locked = m.tier === "pro" && plan !== "pro" && !m.byok;
    return (
      <button key={m.id} type="button" className={sheet.sheetRow} disabled={!m.available} onClick={() => pick(m.id)}>
        <span className={sheet.sheetRowText}>
          <span className={styles.modelName}>
            {m.label}
            {m.tier === "pro" && <span className={`tag ${locked ? "" : "tag-accent"}`}>Pro</span>}
          </span>
          <small>{m.available ? m.description : "Sin API key configurada"}</small>
        </span>
        {m.id === value && <Check size={20} className={sheet.check} aria-label="Elegido" />}
      </button>
    );
  };

  const titles: Record<Page, string> = { models: "Seleccionar modelo", effort: "Esfuerzo", more: "Más modelos" };

  return (
    <>
      <button
        type="button"
        className={styles.modelTrigger}
        aria-label="Modelo y esfuerzo"
        onClick={() => {
          setPage("models");
          setDir("forward");
          setOpen(true);
        }}
      >
        {trigger}
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={titles[page]}
        onBack={page === "models" ? undefined : () => go("models", "back")}
        page={page}
        dir={dir}
      >
        {page === "models" && (
          <>
            <div className={sheet.sheetGroup}>{main.map(row)}</div>
            {level && current && (
              <button type="button" className={`${sheet.sheetRow} ${sheet.sheetRowSolo}`} onClick={() => go("effort")}>
                <span className={sheet.sheetRowText}>Esfuerzo</span>
                <span className={sheet.sheetValue}>{EFFORT_LABEL[level]}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}
            {others.length > 0 && (
              <button type="button" className={`${sheet.sheetRow} ${sheet.sheetRowSolo}`} onClick={() => go("more")}>
                <span className={sheet.sheetRowText}>Más modelos</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}
          </>
        )}
        {page === "effort" && current && (
          <>
            <div className={sheet.sheetGroup}>
              {current.efforts.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={sheet.sheetRow}
                  onClick={() => {
                    onEffort(e);
                    go("models", "back");
                  }}
                >
                  <span className={sheet.sheetRowText}>
                    <span className={styles.modelName}>
                      {EFFORT_LABEL[e]}
                      {e === "medium" && <span className="tag">Predeterminado</span>}
                      {e === "max" && <span className={`tag ${styles.effortCost}`}>Más uso</span>}
                    </span>
                    <small>{EFFORT_HINT[e]}</small>
                  </span>
                  {level === e && <Check size={20} className={sheet.check} aria-label="Elegido" />}
                </button>
              ))}
            </div>
            <p className={styles.sheetNote}>Un mayor esfuerzo da respuestas más completas, pero tarda más y consume tus límites más rápido.</p>
          </>
        )}
        {page === "more" &&
          otherGroups.map((group) => (
            <section key={group} className={styles.sheetSection}>
              <p className="label">{group}</p>
              <div className={sheet.sheetGroup}>{others.filter((m) => groupOf(m) === group).map(row)}</div>
            </section>
          ))}
      </Sheet>
    </>
  );
}
