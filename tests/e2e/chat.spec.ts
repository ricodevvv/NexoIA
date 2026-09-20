import { expect, test } from "@playwright/test";
import { send, signup, waitForIdle } from "./helpers";

test("chat con streaming, markdown, título, regenerar y persistencia", async ({ page }) => {
  await signup(page, "Chat");
  await send(page, "hola mundo");
  await expect(page).toHaveURL(/\/chat\//);
  await waitForIdle(page);

  const answer = page.getByRole("article", { name: "Respuesta" }).last();
  await expect(answer).toContainText("Eco: hola mundo");
  await expect(answer.locator("table")).toBeVisible();
  await expect(answer.getByText("const x = 42;")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Conversaciones" })).toContainText("Título: hola mundo");

  await answer.getByRole("button", { name: "Regenerar respuesta" }).click();
  await waitForIdle(page);
  await expect(page.getByRole("article", { name: "Respuesta" })).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole("article", { name: "Tu mensaje" })).toContainText("hola mundo");
  await expect(page.getByRole("article", { name: "Respuesta" })).toContainText("Eco: hola mundo");
});

test("editar un mensaje reemplaza lo que venía después", async ({ page }) => {
  await signup(page, "Editar");
  await send(page, "primera versión");
  await waitForIdle(page);
  const mine = page.getByRole("article", { name: "Tu mensaje" });
  await mine.hover();
  await mine.getByRole("button", { name: "Editar mensaje" }).click();
  await mine.locator("textarea").fill("segunda versión");
  await mine.getByRole("button", { name: "Enviar" }).click();
  await waitForIdle(page);
  await expect(page.getByRole("article", { name: "Respuesta" })).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Respuesta" })).toContainText("Eco: segunda versión");
});
