const VARIABLE = /\{\{\s*([\w.-]{1,40})\s*\}\}/g;

/**
 * Las variables `{{nombre}}` de uno o varios textos, sin repetir y en orden
 * de aparición.
 */
export function promptVariables(...texts: string[]) {
  const names = new Set<string>();
  for (const text of texts) for (const match of text.matchAll(VARIABLE)) names.add(match[1]);
  return [...names];
}

/**
 * Reemplaza las variables con sus valores; las que falten se dejan como están.
 */
export function fillVariables(text: string, values: Record<string, string>) {
  return text.replace(VARIABLE, (whole, name: string) => (values[name] ? values[name] : whole));
}
