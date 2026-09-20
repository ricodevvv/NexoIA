import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const client = new Client({ connectionString: "postgres://nexo:nexo@localhost:5432/nexo_test" });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export function uniqueEmail(prefix: string) {
  const ascii = prefix.normalize("NFD").replace(/[^a-z0-9]/gi, "").toLowerCase() || "user";
  return `${ascii}-${Date.now()}-${Math.round(Math.random() * 1e6)}@test.dev`;
}

/**
 * Crea una cuenta desde la UI y deja la sesión iniciada.
 */
export async function signup(page: Page, name: string, email = uniqueEmail(name.toLowerCase())) {
  await page.goto("/signup");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("supersecreta1");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL("/");
  return email;
}

export async function send(page: Page, text: string) {
  await page.locator("#composer-input").fill(text);
  await page.keyboard.press("Enter");
}

export async function waitForIdle(page: Page) {
  await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible({ timeout: 90_000 });
}
