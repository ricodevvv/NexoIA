import { expect, test } from "@playwright/test";
import { send, signup, waitForIdle } from "./helpers";

test("API key: se crea, sirve con el formato de OpenAI, aparece en logs y se revoca", async ({ page }) => {
  await signup(page, "Plataforma");
  await page.goto("/platform/keys");
  await page.getByRole("button", { name: "Crear API key" }).first().click();
  await page.getByLabel("Nombre").fill("Script de pruebas");
  await page.getByRole("button", { name: "Crear key" }).click();
  const key = (await page.getByRole("dialog", { name: "Tu nueva API key" }).locator("code").textContent())!.trim();
  expect(key.startsWith("nexo-sk-")).toBe(true);
  await page.getByRole("button", { name: "Ya la guardé" }).click();
  await expect(page.getByRole("row", { name: /Script de pruebas/ })).toBeVisible();

  const models = await page.request.get("/api/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  expect((await models.json()).data.map((m: { id: string }) => m.id)).toContain("compat:mock-1");

  const res = await page.request.post("/api/v1/chat/completions", {
    headers: { Authorization: `Bearer ${key}` },
    data: { model: "compat:mock-1", messages: [{ role: "user", content: "hola api" }] },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.object).toBe("chat.completion");
  expect(body.choices[0].message.content).toContain("Eco: hola api");
  expect(body.usage.total_tokens).toBeGreaterThan(0);

  const stream = await page.request.post("/api/v1/chat/completions", {
    headers: { Authorization: `Bearer ${key}` },
    data: { model: "compat:mock-1", stream: true, stream_options: { include_usage: true }, messages: [{ role: "user", content: "hola stream" }] },
  });
  const text = await stream.text();
  expect(text).toContain('"object":"chat.completion.chunk"');
  expect(text).toContain('"usage"');
  expect(text.trim().endsWith("data: [DONE]")).toBe(true);

  await page.goto("/platform/logs?source=api");
  await expect(page.getByRole("row").filter({ hasText: "mock-1" })).toHaveCount(2);

  await page.goto("/platform/keys");
  await page.getByRole("button", { name: "Revocar" }).click();
  await page.getByRole("button", { name: "Revocar key" }).click();
  await expect(page.getByText("Keys revocadas · 1")).toBeVisible();
  const denied = await page.request.post("/api/v1/chat/completions", {
    headers: { Authorization: `Bearer ${key}` },
    data: { model: "compat:mock-1", messages: [{ role: "user", content: "hola" }] },
  });
  expect(denied.status()).toBe(401);
  expect((await denied.json()).error.type).toBe("authentication_error");

  await page.goto("/platform/activity");
  await expect(page.getByText("Revocó una API key")).toBeVisible();
  await expect(page.getByText("Creó una API key")).toBeVisible();
});

test("playground, biblioteca de prompts y / en el chat", async ({ page }) => {
  await signup(page, "Playground");
  await page.goto("/platform/prompts");
  await page.getByRole("button", { name: /Resumen ejecutivo/ }).click();
  await page.getByRole("button", { name: "Crear prompt" }).click();
  await expect(page.getByRole("heading", { name: "Resumen ejecutivo" })).toBeVisible();

  await page.getByRole("link", { name: "Probar" }).click();
  await expect(page).toHaveURL(/\/platform\/playground\?prompt=/);
  await page.getByLabel("{{texto}}").fill("las ventas crecieron");
  await page.getByRole("button", { name: /Ejecutar/ }).click();
  const output = page.getByRole("region", { name: "Respuesta de mock-1" });
  await expect(output).toContainText("Eco: Resume esto en 5 viñetas");
  await expect(output).toContainText("las ventas crecieron");
  await expect(output).toContainText("entrada");

  await page.goto("/");
  await page.locator("#composer-input").fill("/resumen");
  await expect(page.getByRole("option", { name: /Resumen ejecutivo/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#composer-input")).toHaveValue(/Resume esto en 5 viñetas/);
});

test("chat temporal: no aparece en el historial; archivar y restaurar", async ({ page }) => {
  await signup(page, "Temporal");
  await page.getByRole("button", { name: "Chat temporal" }).click();
  await expect(page.getByRole("heading", { name: "Chat temporal" })).toBeVisible();
  await send(page, "secreto temporal");
  await waitForIdle(page);
  await expect(page.getByText("Temporal", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Conversaciones" })).not.toContainText("secreto temporal");

  await page.goto("/");
  await send(page, "chat para archivar");
  await waitForIdle(page);
  const nav = page.getByRole("navigation", { name: "Conversaciones" });
  await expect(nav).toContainText("chat para archivar");
  await nav.getByRole("button", { name: /Opciones de/ }).first().click();
  await page.getByRole("menuitem", { name: "Archivar" }).click();
  await expect(nav).not.toContainText("chat para archivar");

  await page.goto("/settings?tab=data");
  await page.getByRole("button", { name: /Restaurar/ }).click();
  await expect(nav).toContainText("chat para archivar");
});

test("seguridad: lista la sesión actual y el uso muestra el chat", async ({ page }) => {
  await signup(page, "Seguro");
  await send(page, "hola uso");
  await waitForIdle(page);
  await page.goto("/settings?tab=security");
  await expect(page.getByText("Esta sesión")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activar" })).toBeVisible();

  await page.goto("/platform/usage");
  await expect(page.getByRole("heading", { name: "Uso y costos" })).toBeVisible();
  await page.getByRole("radio", { name: "Tabla" }).click();
  await expect(page.getByRole("region", { name: "Por modelo" })).toContainText("mock-1");
});
