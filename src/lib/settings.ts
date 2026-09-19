import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type UserSettings = {
  preferences: string;
  memoryEnabled: boolean;
  artifactsEnabled: boolean;
};

const DEFAULTS: UserSettings = { preferences: "", memoryEnabled: true, artifactsEnabled: true };

export async function getSettings(userId: string): Promise<UserSettings> {
  const row = await db.query.userSettings.findFirst({ where: eq(schema.userSettings.userId, userId) });
  if (!row) return DEFAULTS;
  return { preferences: row.preferences, memoryEnabled: row.memoryEnabled, artifactsEnabled: row.artifactsEnabled };
}

export async function saveSettings(userId: string, data: Partial<UserSettings>) {
  await db
    .insert(schema.userSettings)
    .values({ userId, ...DEFAULTS, ...data })
    .onConflictDoUpdate({ target: schema.userSettings.userId, set: { ...data, updatedAt: new Date() } });
}

export async function listMemories(userId: string) {
  return db
    .select({ id: schema.memory.id, content: schema.memory.content, createdAt: schema.memory.createdAt })
    .from(schema.memory)
    .where(eq(schema.memory.userId, userId))
    .orderBy(desc(schema.memory.createdAt));
}
