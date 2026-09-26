export const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const CLONED = "nexo:clonado";
const CLONED_LINE = new RegExp(`${CLONED} (\\S+)`);
const CONFIGURED = "nexo:configurado";

export type SetupStep = "container" | "clone" | "script" | "agent";
export type StepStatus = "pending" | "running" | "done" | "skipped" | "error";
export type SetupEvent = { step: SetupStep; status: StepStatus; detail?: string } | { error: string } | { session: { id: string; title: string } };

/**
 * Carpeta donde queda el repo dentro del proyecto: el nombre sin el dueño.
 */
export function repoFolder(fullName: string) {
  return fullName.split("/")[1];
}

export const BRANCH_NAME = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}$/;

/**
 * Comando que clona el repo en su carpeta (o lo actualiza si ya estaba),
 * deja puesta la rama pedida y al final imprime una marca para saber que
 * salió bien y qué repo era.
 */
export function cloneCommand(fullName: string, branch?: string | null) {
  if (!REPO_NAME.test(fullName) || fullName.includes("..")) throw new Error("Nombre de repo inválido");
  if (branch && !BRANCH_NAME.test(branch)) throw new Error("Nombre de rama inválido");
  const dir = repoFolder(fullName);
  const url = `https://github.com/${fullName}.git`;
  const fetch = `git -C '${dir}' fetch --quiet origin${branch ? ` && git -C '${dir}' checkout --quiet '${branch}'` : ""}`;
  const clone = `git clone --quiet${branch ? ` --branch '${branch}'` : ""} '${url}' '${dir}'`;
  return `if [ -d '${dir}/.git' ]; then ${fetch}; else ${clone}; fi && echo '${CLONED} ${fullName}'`;
}

/**
 * Si el comando es el de clonado del arranque, devuelve el repo.
 */
export function clonedRepo(command: unknown) {
  if (typeof command !== "string" || !command.includes(CLONED)) return null;
  return CLONED_LINE.exec(command)?.[1]?.replace(/'$/, "") ?? null;
}

/**
 * Dice si la salida del clonado trae la marca del final, o sea que git terminó bien.
 */
export function cloneSucceeded(output: string) {
  return output.split("\n").some((line) => line.trim().startsWith(`${CLONED} `));
}

/**
 * Comando que corre el script de configuración del entorno (viene en la
 * variable `NEXO_SETUP_SCRIPT` del contenedor) dentro del repo si hay uno, y
 * al final imprime su marca.
 */
export function scriptCommand(repo: string | null) {
  const cd = repo ? `cd '${repoFolder(repo)}' && ` : "";
  return `${cd}bash -e -c "$NEXO_SETUP_SCRIPT" && echo '${CONFIGURED}'`;
}

export function isScriptCommand(command: unknown) {
  return typeof command === "string" && command.includes(`echo '${CONFIGURED}'`);
}

export function scriptSucceeded(output: string) {
  return output.split("\n").some((line) => line.trim() === CONFIGURED);
}

const PUSHED = "nexo:rama";
const COMMIT = "nexo:commit";

function branchSlug(title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `nexo/${slug || "cambios"}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Comando que deja lista la rama para un pull request: si el repo está en la
 * rama por defecto se pasa a una nueva, guarda en un commit lo que quedó sin
 * guardar, la sube y al final imprime la rama y los commits que lleva por
 * delante de la rama por defecto.
 */
export function pushCommand(fullName: string, base: string, title: string) {
  if (!REPO_NAME.test(fullName) || fullName.includes("..")) throw new Error("Nombre de repo inválido");
  if (!BRANCH_NAME.test(base)) throw new Error("Nombre de rama inválido");
  const message = Buffer.from(title || "Cambios de Nexo Code").toString("base64");
  return [
    `cd '${repoFolder(fullName)}'`,
    `cur=$(git branch --show-current)`,
    `if [ -z "$cur" ] || [ "$cur" = '${base}' ]; then git switch -q -c '${branchSlug(title)}'; fi`,
    `if [ -n "$(git status --porcelain)" ]; then git add -A && git commit -q -m "$(printf %s '${message}' | base64 -d)"; fi`,
    `git push -q -u origin HEAD 2>&1`,
    `echo "${PUSHED} $(git branch --show-current)"`,
    `git log --format='${COMMIT} %s' 'origin/${base}..HEAD' 2>/dev/null | head -n 30`,
  ].join(" && ");
}

export function isPushCommand(command: unknown) {
  return typeof command === "string" && command.includes(`echo "${PUSHED} `);
}

/**
 * Lee la salida de `pushCommand`: la rama que se subió y los títulos de sus
 * commits, del más nuevo al más viejo.
 */
export function pushResult(output: string) {
  const lines = output.split("\n").map((l) => l.trim());
  const branch = lines.find((l) => l.startsWith(`${PUSHED} `))?.slice(PUSHED.length + 1) ?? null;
  const commits = lines.filter((l) => l.startsWith(`${COMMIT} `)).map((l) => l.slice(COMMIT.length + 1));
  return { branch: branch || null, commits };
}
