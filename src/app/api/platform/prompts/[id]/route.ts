import { z } from "zod";
import { audit } from "@/lib/audit";
import { countPromptUse, deletePrompt, PromptInput, updatePrompt } from "@/lib/platform/prompts";
import { apiUser, handleError } from "@/lib/session";

export async function PATCH(request: Request, ctx: RouteContext<"/api/platform/prompts/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    return Response.json(await updatePrompt(user.id, id, PromptInput.partial().parse(await request.json())));
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Revisa el nombre y el contenido del prompt" }, { status: 400 });
    return handleError(err);
  }
}

/**
 * Cuenta un uso del prompt (cuando se inserta en el chat o en el playground).
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/platform/prompts/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await countPromptUse(user.id, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/platform/prompts/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const row = await deletePrompt(user.id, id);
    await audit({ userId: user.id, action: "prompt.deleted", target: row.name, headers: request.headers });
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
