import { expect, test } from "@playwright/test";
import { signup } from "./helpers";

test("Nexo Code conecta un servidor, pide permiso, corre el comando y muestra los cambios", async ({ page }) => {
  await signup(page, "Codigo");
  await page.goto("/code");
  await expect(page.getByRole("heading", { name: "Programa con un agente desde Nexo" })).toBeVisible();
  await page.getByLabel("Nombre").fill("Mock");
  await page.getByLabel("URL del servidor").fill("http://127.0.0.1:4130");
  await page.getByLabel("Contraseña").fill("clave-de-prueba");
  await page.getByRole("button", { name: "Conectar servidor" }).click();

  await page.getByRole("button", { name: "Nueva sesión" }).first().click();
  await page.locator("#code-input").fill("corre las pruebas #comando");
  await page.keyboard.press("Enter");

  const permission = page.getByRole("alertdialog", { name: "Nexo Code quiere ejecutar un comando" });
  await expect(permission).toContainText("npm test");
  await permission.getByRole("button", { name: "Permitir una vez" }).click();
  await expect(permission).toHaveCount(0);

  await expect(page.getByText("Listo, las pruebas pasan.")).toBeVisible();
  await page.getByRole("button", { name: "Ejecutó 1 comando" }).click();
  await page.getByRole("button", { name: "Corre las pruebas", exact: true }).click();
  await expect(page.getByText("12 pruebas pasaron")).toBeVisible();
  await page.getByRole("button", { name: "Volver al resumen" }).click();
  await page.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByRole("button", { name: /corre las pruebas/i }).first()).toBeVisible();

  await page.getByRole("button", { name: "Cambios" }).click();
  await page.getByRole("button", { name: /src\/app\.js/ }).click();
  await expect(page.getByText("+nuevo")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Listo, las pruebas pasan.")).toBeVisible();
});

test("cuando el agente pregunta, sale un menú para elegir y la respuesta le llega", async ({ page }) => {
  await signup(page, "Preguntas");
  await page.goto("/code");
  await page.getByLabel("Nombre").fill("Mock");
  await page.getByLabel("URL del servidor").fill("http://127.0.0.1:4130");
  await page.getByLabel("Contraseña").fill("clave-de-prueba");
  await page.getByRole("button", { name: "Conectar servidor" }).click();
  await page.getByRole("button", { name: "Nueva sesión" }).first().click();
  await page.locator("#code-input").fill("hazme un plugin #pregunta");
  await page.keyboard.press("Enter");

  const menu = page.getByRole("group", { name: "Versión" });
  await expect(menu).toContainText("¿Para qué versión de Minecraft hago el plugin?");
  await expect(menu.getByRole("button", { name: "Enviar" })).toBeDisabled();
  await menu.getByRole("radio", { name: /1\.20\.4/ }).click();
  await menu.getByRole("button", { name: "Enviar" }).click();

  await expect(menu).toHaveCount(0);
  await expect(page.getByText("Perfecto, lo hago para 1.20.4.")).toBeVisible();
});
