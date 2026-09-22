import { getCodeServer, nexocodeJson } from "@/lib/nexocode";
import { apiUser, handleError } from "@/lib/session";

type Providers = { providers: { id: string; name: string; models: Record<string, { id: string; name: string }> }[]; default: Record<string, string> };

export async function GET(_request: Request, ctx: RouteContext<"/api/code/[server]/models">) {
  try {
    const user = await apiUser();
    const server = await getCodeServer(user, (await ctx.params).server);
    const data = await nexocodeJson<Providers>(server, "/config/providers");
    const models = data.providers.flatMap((p) =>
      Object.values(p.models).map((m) => ({ providerID: p.id, modelID: m.id, label: m.name, provider: p.name })),
    );
    const [defaultProvider, defaultModel] = Object.entries(data.default)[0] ?? [];
    return Response.json({ models, default: defaultProvider ? { providerID: defaultProvider, modelID: defaultModel } : null });
  } catch (err) {
    return handleError(err);
  }
}
