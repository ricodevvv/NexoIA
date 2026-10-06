/**
 * URL pública de Nexo, la que ven los usuarios en el navegador.
 */
export function publicBaseUrl() {
  return (process.env.NEXO_PUBLIC_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Base de la API compatible con OpenAI, para los ejemplos y la documentación.
 */
export function apiBaseUrl() {
  return `${publicBaseUrl()}/api/v1`;
}
