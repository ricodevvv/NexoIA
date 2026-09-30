export const THEME_COLORS = { light: "#fbfbfa", dark: "#151515" } as const;

const META_ID = "nexo-theme-color";

/**
 * Pone la barra del navegador del color del fondo cuando el tema está forzado.
 * Mete su propia meta al inicio del head para ganarle a las de media query.
 */
export function syncThemeColor(theme: "system" | "light" | "dark") {
  document.getElementById(META_ID)?.remove();
  if (theme === "system") return;
  const meta = document.createElement("meta");
  meta.id = META_ID;
  meta.name = "theme-color";
  meta.content = THEME_COLORS[theme];
  document.head.prepend(meta);
}
