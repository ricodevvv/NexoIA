import { z } from "zod";
import { audit } from "@/lib/audit";
import { createPrompt, listPrompts, PromptInput } from "@/lib/platform/prompts";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError } from "@/lib/session";

export async function GET() {
  try {
    const user = await apiUser();
    return Response.json(await listPrompts(user.id));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `platform:prompts:${user.id}`, ...LIMITS.platform }]);
    const prompt = await createPrompt(user.id, PromptInput.parse(await request.json()));
    await audit({ userId: user.id, action: "prompt.created", target: prompt.name, headers: request.headers });
    return Response.json(prompt);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Revisa el nombre y el contenido del prompt" }, { status: 400 });
    return handleError(err);
  }
}
