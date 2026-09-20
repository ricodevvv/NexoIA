"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, Feather, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { StyleOption } from "@/lib/styles";
import styles from "./chat.module.css";

/**
 * Menú para elegir el estilo de respuesta desde el composer.
 */
export function StylePicker({ options, value, onChange }: { options: StyleOption[]; value: string; onChange: (id: string) => void }) {
  const router = useRouter();
  const current = options.find((o) => o.id === value) ?? options[0];
  const active = current.id !== "normal";

  return (
    <Menu.Root>
      <Menu.Trigger
        className={styles.styleTrigger}
        data-active={active}
        aria-label={`Estilo de respuesta: ${current.name}`}
        title="Estilo de respuesta"
      >
        <Feather size={15} aria-hidden="true" />
        {active && <span>{current.name}</span>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={`menu ${styles.modelMenu}`} side="top" align="start" sideOffset={8}>
          <Menu.Label className="menu-label label">Estilo de respuesta</Menu.Label>
          {options.map((o, i) => (
            <div key={o.id}>
              {o.custom && !options[i - 1]?.custom && <Menu.Separator className="menu-sep" />}
              <Menu.Item className={`menu-item ${styles.modelItem}`} onSelect={() => onChange(o.id)}>
                <span className={styles.modelText}>
                  <span className={styles.modelName}>{o.name}</span>
                  <span className={styles.modelDesc}>{o.description}</span>
                </span>
                {o.id === current.id && <Check size={15} aria-label="Seleccionado" />}
              </Menu.Item>
            </div>
          ))}
          <Menu.Separator className="menu-sep" />
          <Menu.Item className="menu-item" onSelect={() => router.push("/settings?tab=personalization#estilos")}>
            <Settings2 /> Crear y editar estilos
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
