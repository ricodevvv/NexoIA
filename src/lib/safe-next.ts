/**
 * Solo acepta rutas internas para evitar redirecciones a otros sitios.
 */
export function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
