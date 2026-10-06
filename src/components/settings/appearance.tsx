"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useChatWidth, useFontSize } from "../use-appearance";
import { useTheme, type Theme } from "../use-theme";
import { Segmented } from "../ui/segmented";
import { Section } from "./settings";
import styles from "./settings.module.css";

const THEMES: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
];

/**
 * Tema, tamaño de letra y ancho del chat. Se guardan en este navegador.
 */
export function Appearance() {
  const [theme, setTheme] = useTheme();
  const [font, setFont] = useFontSize();
  const [width, setWidth] = useChatWidth();

  return (
    <>
      <Section title="Tema" description="Sistema sigue lo que tengas en tu computadora o teléfono.">
        <div className={styles.themes} role="radiogroup" aria-label="Tema">
          {THEMES.map(({ value, label, Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={theme === value} className={styles.themeCard} data-preview={value} onClick={() => setTheme(value)}>
              <span className={styles.themePreview} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className={styles.themeLabel}>
                <Icon size={15} aria-hidden="true" /> {label}
              </span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Tamaño de letra" description="Cambia el tamaño de toda la interfaz.">
        <Segmented
          value={font}
          onChange={setFont}
          label="Tamaño de letra"
          options={[
            { value: "sm", label: "Chica" },
            { value: "md", label: "Normal" },
            { value: "lg", label: "Grande" },
          ]}
        />
      </Section>
      <Section title="Ancho del chat" description="En pantallas grandes, el modo amplio aprovecha más espacio para código y tablas.">
        <Segmented
          value={width}
          onChange={setWidth}
          label="Ancho del chat"
          options={[
            { value: "normal", label: "Normal" },
            { value: "wide", label: "Amplio" },
          ]}
        />
      </Section>
      <p className="hint">Estas preferencias se guardan solo en este navegador.</p>
    </>
  );
}
