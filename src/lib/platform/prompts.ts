import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { promptVariables } from "./prompt-text";

export { fillVariables, promptVariables } from "./prompt-text";

export const PromptInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  system: z.string().max(20_000).default(""),
  content: z.string().trim().min(1).max(50_000),
  model: z.string().max(200).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

export type PromptView = {
  id: string;
  name: string;
  description: string;
  system: string;
  content: string;
  model: string | null;
  tags: string[];
  uses: number;
  variables: string[];
  updatedAt: string;
};

function view(row: typeof schema.prompt.$inferSelect): PromptView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    system: row.system,
    content: row.content,
    model: row.model,
    tags: row.tags,
    uses: row.uses,
    variables: promptVariables(row.system, row.content),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPrompts(userId: string) {
  const rows = await db.query.prompt.findMany({ where: eq(schema.prompt.userId, userId), orderBy: desc(schema.prompt.updatedAt) });
  return rows.map(view);
}

export async function createPrompt(userId: string, input: z.infer<typeof PromptInput>) {
  const [row] = await db
    .insert(schema.prompt)
    .values({ id: nanoid(), userId, ...input })
    .returning();
  return view(row);
}

export async function updatePrompt(userId: string, id: string, input: Partial<z.infer<typeof PromptInput>>) {
  const [row] = await db
    .update(schema.prompt)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.prompt.id, id), eq(schema.prompt.userId, userId)))
    .returning();
  if (!row) throw new HttpError(404, "Prompt no encontrado");
  return view(row);
}

export async function deletePrompt(userId: string, id: string) {
  const [row] = await db
    .delete(schema.prompt)
    .where(and(eq(schema.prompt.id, id), eq(schema.prompt.userId, userId)))
    .returning({ name: schema.prompt.name });
  if (!row) throw new HttpError(404, "Prompt no encontrado");
  return row;
}

export async function countPromptUse(userId: string, id: string) {
  await db
    .update(schema.prompt)
    .set({ uses: sql`${schema.prompt.uses} + 1` })
    .where(and(eq(schema.prompt.id, id), eq(schema.prompt.userId, userId)));
}
