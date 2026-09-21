import { expect, test } from "@playwright/test";
import { send, signup, waitForIdle } from "./helpers";

test("un conector MCP agregado en ajustes se usa en el chat", async ({ page }) => {
  await signup(page, "Mcp");
  await page.goto("/settings?tab=connectors");
  await page.getByLabel("Nombre").fill("Reloj");
  await page.getByLabel("URL del servidor").fill("http://127.0.0.1:4110/mcp");
  await page.getByRole("button", { name: "Agregar conector" }).click();
  await page.getByRole("button", { name: "Probar conexión" }).click();
  await expect(page.getByText("Conectado. Tools: get_time")).toBeVisible();

  await page.goto("/");
  await send(page, "#hora por favor");
  await waitForIdle(page);
  await expect(page.getByText("reloj · get_time")).toBeVisible();
  await expect(page.getByRole("article", { name: "Respuesta" })).toContainText("12:34 UTC");
});

test("un artifact React se abre en el panel y es interactivo", async ({ page }) => {
  await signup(page, "Artifact");
  await send(page, "#artifact");
  const frame = page.frameLocator("iframe[title='Contador']");
  await expect(frame.locator("h1")).toHaveText("Contador: 0", { timeout: 60_000 });
  await frame.getByRole("button", { name: "Sumar" }).click();
  await expect(frame.locator("h1")).toHaveText("Contador: 1");
  await page.getByRole("tab", { name: "Código" }).click();
  await expect(page.getByText("useState(0)")).toBeVisible();
});

test("la ejecución de Python lee un adjunto y devuelve una gráfica", async ({ page }) => {
  await signup(page, "Python");
  await page.locator("input[type=file]").setInputFiles({
    name: "ventas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("mes,ventas\nene,120\nfeb,150\nmar,90\n"),
  });
  await expect(page.getByText("ventas.csv")).toBeVisible();
  await send(page, "#python");
  await expect(page.getByAltText("figura_1.png")).toBeVisible({ timeout: 110_000 });
  await expect(page.getByRole("article", { name: "Respuesta" })).toContainText("valor final: 360");
});

test("un conector con OAuth se autoriza, se usa en el chat y renueva su token solo", async ({ page, request }) => {
  await signup(page, "Oauth");
  await page.goto("/settings?tab=connectors");
  await page.getByLabel("Nombre").fill("Privado");
  await page.getByLabel("URL del servidor").fill("http://127.0.0.1:4120/mcp");
  await page.getByText("Iniciar sesión (OAuth)").click();
  await page.getByRole("button", { name: "Agregar y autorizar" }).click();

  await expect(page).toHaveURL(/oauth=ok/);
  await expect(page.getByText("Listo, Privado quedó autorizado.")).toBeVisible();
  await expect(page.getByText("OAuth · conectado")).toBeVisible();

  await page.goto("/");
  await send(page, "#quien soy");
  await waitForIdle(page);
  await expect(page.getByRole("article", { name: "Respuesta" })).toContainText("usuario autenticado por OAuth");

  await page.waitForTimeout(6000);
  await send(page, "#quien soy otra vez");
  await waitForIdle(page);
  await expect(page.getByRole("article", { name: "Respuesta" }).last()).toContainText("usuario autenticado por OAuth");
  const stats = await (await request.get("http://127.0.0.1:4120/stats")).json();
  expect(stats.refreshed).toBeGreaterThanOrEqual(1);
});

test("el modelo puede buscar en chats anteriores", async ({ page }) => {
  await signup(page, "Memoria");
  await send(page, "Hablemos del ornitorrinco australiano");
  await waitForIdle(page);
  await page.goto("/");
  await send(page, "#busca ornitorrinco");
  await waitForIdle(page);
  await expect(page.getByText("Chats anteriores · buscar")).toBeVisible();
  await expect(page.getByRole("article", { name: "Respuesta" })).toContainText("Hablemos del ornitorrinco");
});
