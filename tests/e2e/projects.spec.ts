import { expect, test } from "@playwright/test";
import { send, signup, waitForIdle } from "./helpers";

test("las instrucciones y archivos del proyecto llegan al modelo, y compartir funciona sin sesión", async ({ page, browser }) => {
  await signup(page, "Proyecto");
  await page.goto("/projects");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByLabel("Nombre").fill("Barco");
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page).toHaveURL(/\/projects\//);

  await page.getByRole("button", { name: "Agregar" }).first().click();
  await page.locator("textarea").last().fill("Habla como PIRATA.");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.locator("input[type=file]").last().setInputFiles({ name: "mapa.txt", mimeType: "text/plain", buffer: Buffer.from("isla calavera") });
  await expect(page.getByRole("link", { name: "mapa.txt" })).toBeVisible();

  await send(page, "#sistema");
  await waitForIdle(page);
  const answer = page.getByRole("article", { name: "Respuesta" });
  await expect(answer).toContainText('"proyecto":true');
  await expect(answer).toContainText("Habla como PIRATA.");
  await expect(answer).toContainText("isla calavera");

  await page.getByRole("button", { name: "Compartir" }).click();
  await page.getByRole("button", { name: "Crear enlace" }).click();
  const url = await page.getByLabel("Enlace público").inputValue();

  const anonymous = await browser.newContext();
  const pub = await anonymous.newPage();
  await pub.goto(url);
  await expect(pub.getByText("Chat compartido")).toBeVisible();
  await expect(pub.getByRole("article", { name: "Respuesta" })).toContainText("Habla como PIRATA.");
  await anonymous.close();
});
