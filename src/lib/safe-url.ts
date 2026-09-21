import { lookup } from "node:dns/promises";

function isPrivateAddress(address: string) {
  if (address === "::1" || address.startsWith("fe80:") || /^f[cd]/i.test(address)) return true;
  const v4 = address.replace(/^::ffff:/, "");
  const [a, b] = v4.split(".").map(Number);
  if ([a, b].some(Number.isNaN)) return false;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Valida que la URL de un servidor MCP apunte a internet y no a la red interna
 * del servidor. Se puede desactivar con `ALLOW_PRIVATE_MCP=1` para desarrollo.
 */
export async function assertSafeUrl(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("La URL debe ser http o https");
  if (process.env.ALLOW_PRIVATE_MCP === "1") return url;
  if (url.protocol !== "https:") throw new Error("Solo se permiten servidores MCP con https");
  const records = await lookup(url.hostname, { all: true });
  if (records.some((r) => isPrivateAddress(r.address))) throw new Error("La URL apunta a una red privada");
  return url;
}

/**
 * `fetch` que valida cada URL antes de pedirla y no sigue redirecciones. Se usa
 * en todo lo que pide el cliente MCP, incluido el descubrimiento OAuth, porque
 * esas URLs las decide el servidor remoto.
 */
export async function safeFetch(input: string | URL | Request, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  await assertSafeUrl(url);
  return fetch(input, { ...init, redirect: "error" });
}
