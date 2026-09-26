export const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const CLONED = "nexo:clonado";
const CLONED_LINE = new RegExp(`${CLONED} (\\S+)`);

export type SetupStep = "container" | "clone" | "agent";
export type StepStatus = "pending" | "running" | "done" | "error";
export type SetupEvent = { step: SetupStep; status: StepStatus; detail?: string } | { error: string } | { session: { id: string; title: string } };

/**
 * Carpeta donde queda el repo dentro del proyecto: el nombre sin el dueño.
 */
export function repoFolder(fullName: string) {
  return fullName.split("/")[1];
}

/**
 * Comando que clona el repo en su carpeta, o lo actualiza si ya estaba, y al
 * final imprime una marca para saber que salió bien y qué repo era.
 */
export function cloneCommand(fullName: string) {
  if (!REPO_NAME.test(fullName) || fullName.includes("..")) throw new Error("Nombre de repo inválido");
  const dir = repoFolder(fullName);
  return `if [ -d '${dir}/.git' ]; then git -C '${dir}' fetch --quiet origin; else git clone --quiet 'https://github.com/${fullName}.git' '${dir}'; fi && echo '${CLONED} ${fullName}'`;
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
