import { remoteModelId } from "@/lib/ai/models";
import { type CodeServer, getCodeServer, isCloud, nexocodeJson } from "@/lib/nexocode";
import { apiUser, handleError } from "@/lib/session";
import { providerFor, runningSessionServer, workspaceModels } from "@/lib/workspaces";

type Providers = {
  providers: { id: string; name: string; models: Record<string, { id: string; name: string; variants?: Record<string, unknown> }> }[];
  default: Record<string, string>;
};

async function fromServer(server: CodeServer) {
  const data = await nexocodeJson<Providers>(server, "/config/providers");
  const models = data.providers.flatMap((p) =>
    Object.values(p.models).map((m) => ({ providerID: p.id, modelID: m.id, label: m.name, provider: p.name, variants: Object.keys(m.variants ?? {}) })),
  );
  const [defaultProvider, defaultModel] = Object.entries(data.default)[0] ?? [];
  return { models, default: defaultProvider ? { providerID: defaultProvider, modelID: defaultModel } : null };
}

/**
 * Los modelos de la nube sin prender un contenedor: salen de la misma lista
 * con la que se arma la config de cada pod. Los niveles de esfuerzo solo los
 * sabe nexocode, así que si hay un contenedor prendido se le preguntan a él.
 */
async function cloudModels(userId: string) {
  const running = await runningSessionServer(userId);
  if (running) {
    const found = await fromServer(running).catch(() => null);
    if (found) return found;
  }
  const models = (await workspaceModels(userId)).map((m) => {
    const p = providerFor(m);
    return { providerID: p.key, modelID: remoteModelId(m.id), label: m.label, provider: p.name, variants: [] as string[] };
  });
  return { models, default: models[0] ? { providerID: models[0].providerID, modelID: models[0].modelID } : null };
}

export async function GET(_request: Request, ctx: RouteContext<"/api/code/[server]/models">) {
  try {
    const user = await apiUser();
    const serverId = (await ctx.params).server;
    if (isCloud(serverId)) return Response.json(await cloudModels(user.id));
    return Response.json(await fromServer(await getCodeServer(user, serverId)));
  } catch (err) {
    return handleError(err);
  }
}
