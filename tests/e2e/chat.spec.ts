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

test("editar y regenerar crean versiones y se puede volver a las anteriores", async ({ page }) => {
  await signup(page, "Ramas");
  await send(page, "primera versión");
  await waitForIdle(page);
  const mine = page.getByRole("article", { name: "Tu mensaje" });
  await mine.hover();
  await mine.getByRole("button", { name: "Editar mensaje" }).click();
  await mine.locator("textarea").fill("segunda versión");
  await mine.getByRole("button", { name: "Enviar" }).click();
  await waitForIdle(page);

  const answer = page.getByRole("article", { name: "Respuesta" });
  await expect(answer).toHaveCount(1);
  await expect(answer).toContainText("Eco: segunda versión");
  await expect(mine.getByText("2/2")).toBeVisible();

  await mine.getByRole("button", { name: "Versión anterior" }).click();
  await expect(answer).toContainText("Eco: primera versión");
  await expect(mine.getByText("1/2")).toBeVisible();

  await answer.getByRole("button", { name: "Regenerar respuesta" }).click();
  await waitForIdle(page);
  await expect(answer.getByText("2/2")).toBeVisible();
  await expect(mine.getByText("1/2")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("article", { name: "Tu mensaje" })).toContainText("primera versión");
  await expect(page.getByRole("article", { name: "Respuesta" }).getByText("2/2")).toBeVisible();
});
