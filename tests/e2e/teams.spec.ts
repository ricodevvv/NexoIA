import { expect, test } from "@playwright/test";
import { query, send, signup, uniqueEmail, waitForIdle } from "./helpers";

test("invitar a un equipo, compartir un proyecto y respetar permisos", async ({ page, browser }) => {
  await signup(page, "Dueña");
  await page.getByRole("button", { name: /Personal/ }).click();
  await page.getByRole("menuitem", { name: "Crear equipo" }).click();
  await page.getByLabel("Nombre del equipo").fill("Acme");
  await page.getByRole("button", { name: "Crear equipo" }).click();
  await expect(page).toHaveURL(/\/workspace/);

  const guestEmail = uniqueEmail("invitado");
  await page.getByPlaceholder("nombre@empresa.com").fill(guestEmail);
  await page.getByRole("button", { name: "Invitar" }).click();
  await expect(page.getByText(`Invitación enviada a ${guestEmail}`)).toBeVisible();

  await page.goto("/projects");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Manual del equipo");
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await page.getByRole("button", { name: "Agregar" }).first().click();
  await page.locator("textarea").last().fill("Somos Acme.");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Somos Acme.")).toBeVisible();

  const [invitation] = await query<{ id: string }>("select id from invitation where email = $1", [guestEmail]);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/invite/${invitation.id}`);
  await expect(guest).toHaveURL(/\/login\?next=/);
  await guest.getByRole("link", { name: "Crea una cuenta" }).click();
  await guest.getByLabel("Nombre").fill("Invitado");
  await guest.getByLabel("Email").fill(guestEmail);
  await guest.getByLabel("Contraseña").fill("supersecreta1");
  await guest.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(guest).toHaveURL(`/invite/${invitation.id}`);
  await guest.getByRole("button", { name: "Unirme al equipo" }).click();
  await expect(guest).toHaveURL(/\/workspace/);
  await expect(guest.getByText("Miembros · 2")).toBeVisible();

  await guest.goto("/projects");
  await guest.getByRole("link", { name: /Manual del equipo/ }).click();
  await expect(guest.getByText("Compartido con Acme")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Opciones del proyecto" })).toHaveCount(0);
  await send(guest, "#sistema");
  await waitForIdle(guest);
  await expect(guest.getByRole("article", { name: "Respuesta" })).toContainText("Somos Acme.");
  await guestContext.close();
});
