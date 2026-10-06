import { modelOptions } from "@/lib/ai/options";
import { listModels } from "@/lib/ai/models";

/**
 * Función que da el nombre bonito de un modelo, incluyendo los de endpoints
 * propios del usuario. Si no lo conoce, devuelve el id sin prefijos.
 */
export async function modelLabeler(userId: string) {
  const options = await modelOptions(userId);
  const labels = new Map<string, string>([...listModels().map((m) => [m.id, m.label] as const), ...options.map((m) => [m.id, m.label] as const)]);
  return (id: string) => labels.get(id) ?? id.replace(/^compat:/, "").replace(/^ep:[^:]+:/, "");
}
