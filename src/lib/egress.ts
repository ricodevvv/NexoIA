import { createHmac } from "node:crypto";

export const NETWORK_LEVELS = ["none", "trusted", "full"] as const;
export type NetworkLevel = (typeof NETWORK_LEVELS)[number];

const DOMAIN = /^(\*\.)?([a-z0-9-]+\.)+[a-z0-9-]+$/;

/**
 * Limpia la lista de dominios extra que escribe el usuario: uno por línea o
 * separados por comas, con `*.` para incluir subdominios.
 */
export function parseDomains(raw: string) {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
        .filter((d) => DOMAIN.test(d)),
    ),
  ].slice(0, 100);
}

function nexoHost() {
  const url = process.env.NEXO_PUBLIC_URL ?? process.env.BETTER_AUTH_URL ?? "";
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Dice si hay proxy de salida para los pods. Sin él los niveles de red no se
 * pueden aplicar y los pods salen directo.
 */
export function egressEnabled() {
  return Boolean(process.env.NEXO_EGRESS_PROXY && process.env.NEXO_EGRESS_SECRET);
}

const ALWAYS = ["github.com", "*.github.com"];

/**
 * Arma la URL del proxy con la política del entorno firmada. Nexo y GitHub
 * siempre quedan permitidos: por Nexo pasan los modelos y las credenciales de
 * git, y sin GitHub no se puede clonar el repo de la sesión.
 */
export function egressProxyUrl(level: NetworkLevel, domains: string[]) {
  const secret = process.env.NEXO_EGRESS_SECRET;
  const proxy = process.env.NEXO_EGRESS_PROXY;
  if (!secret || !proxy) return null;
  const host = nexoHost();
  const payload = Buffer.from(JSON.stringify({ n: level, d: [...(host ? [host] : []), ...ALWAYS, ...domains] })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `http://nexo:${payload}.${sig}@${proxy.replace(/^https?:\/\//, "")}`;
}
