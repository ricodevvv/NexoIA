import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { PRESET_STYLES, type StyleOption } from "./styles";

/**
 * Estilos que puede elegir el usuario: los de fábrica y los suyos.
 */
export async function listStyles(userId: string): Promise<StyleOption[]> {
  const rows = await db
    .select({ id: schema.responseStyle.id, name: schema.responseStyle.name, instructions: schema.responseStyle.instructions })
    .from(schema.responseStyle)
    .where(eq(schema.responseStyle.userId, userId))
    .orderBy(asc(schema.responseStyle.createdAt));
  return [
    ...PRESET_STYLES,
    ...rows.map((r) => ({ ...r, description: "Estilo propio", custom: true })),
  ];
}
