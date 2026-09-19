import { z } from "zod";
import { getSettings, saveSettings } from "@/lib/settings";
import { apiUser, handleError } from "@/lib/session";

const Patch = z.object({
  preferences: z.string().max(5000).optional(),
  memoryEnabled: z.boolean().optional(),
  artifactsEnabled: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await apiUser();
    return Response.json(await getSettings(user.id));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await apiUser();
    await saveSettings(user.id, Patch.parse(await request.json()));
    return Response.json(await getSettings(user.id));
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}
