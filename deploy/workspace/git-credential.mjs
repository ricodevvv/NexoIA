import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const NEXO_URL = (process.env.NEXO_URL ?? "").replace(/\/+$/, "");
const NEXO_TOKEN = process.env.NEXO_TOKEN ?? "";

/**
 * Credential helper de git para github.com. Git lo llama con `get` y los
 * datos de la petición por stdin; se le pide a Nexo el token del usuario en
 * ese momento, así ningún token queda guardado en el espacio. De paso deja
 * puesta la identidad de GitHub para los commits.
 */
async function main() {
  if (process.argv[2] !== "get") return;
  const input = Object.fromEntries(
    readFileSync(0, "utf8")
      .split("\n")
      .map((line) => line.split(/=(.*)/s))
      .filter(([key]) => key),
  );
  if (input.host !== "github.com") return;
  if (!NEXO_URL || !NEXO_TOKEN) {
    process.stderr.write("nexo: el espacio no tiene NEXO_URL y NEXO_TOKEN; reinícialo desde Nexo.\n");
    return;
  }
  const res = await fetch(`${NEXO_URL}/api/workspace/github/credential`, {
    method: "POST",
    headers: { Authorization: `Bearer ${NEXO_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  }).catch((err) => ({ ok: false, status: 0, json: async () => ({ error: err.message }) }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    process.stderr.write(`nexo: ${data.error ?? `Nexo respondió ${res.status}`}\n`);
    return;
  }
  for (const [key, value] of [["user.name", data.name], ["user.email", data.email]]) {
    try {
      if (value && execFileSync("git", ["config", "--global", "--get", key], { encoding: "utf8" }).trim() !== value) {
        execFileSync("git", ["config", "--global", key, value]);
      }
    } catch {
      if (value) execFileSync("git", ["config", "--global", key, value]);
    }
  }
  process.stdout.write(`username=${data.username}\npassword=${data.password}\n`);
}

main();
