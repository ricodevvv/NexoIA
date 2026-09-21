import { and, desc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { assertSafeUrl } from "@/lib/mcp";
import { isConnected } from "@/lib/mcp-oauth";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiSession, handleError, HttpError } from "@/lib/session";
import { activeWorkspace, canManage } from "@/lib/workspace";

const McpInput = z.object({
  name: z.string().trim().min(1).max(40),
  url: z.string().trim().url(),
  headers: z.record(z.string(), z.string()).default({}),
  authType: z.enum(["headers", "oauth"]).default("headers"),
});

async function scope(request: Request, write: boolean) {
  const data = await apiSession();
  if (new URL(request.url).searchParams.get("workspace") !== "1") {
    return { user: data.user, organizationId: null, filter: and(eq(schema.mcpServer.userId, data.user.id), isNull(schema.mcpServer.organizationId)) };
  }
  const workspace = await activeWorkspace(data);
  if (!workspace) throw new HttpError(400, "No tienes un equipo activo");
  if (write && !canManage(workspace.role)) throw new HttpError(403, "Solo los admins del equipo manejan sus conectores");
  return { user: data.user, organizationId: workspace.id, filter: eq(schema.mcpServer.organizationId, workspace.id) };
}

export async function GET(request: Request) {
  try {
    const { filter } = await scope(request, false);
    const rows = await db
      .select({
        id: schema.mcpServer.id,
        name: schema.mcpServer.name,
        url: schema.mcpServer.url,
        enabled: schema.mcpServer.enabled,
        hasHeaders: schema.mcpServer.headers,
        authType: schema.mcpServer.authType,
        oauth: schema.mcpServer.oauth,
      })
      .from(schema.mcpServer)
      .where(filter)
      .orderBy(desc(schema.mcpServer.createdAt));
    return Response.json(
      rows.map(({ oauth, ...r }) => ({ ...r, hasHeaders: Boolean(r.hasHeaders), connected: isConnected({ authType: r.authType, oauth }) })),
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { user, organizationId } = await scope(request, true);
    await enforce([{ key: `mcp:u:${user.id}`, ...LIMITS.connector }]);
    const input = McpInput.parse(await request.json());
    try {
      await assertSafeUrl(input.url);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const [row] = await db
      .insert(schema.mcpServer)
      .values({
        id: nanoid(),
        userId: user.id,
        organizationId,
        name: input.name,
        url: input.url,
        authType: input.authType,
        headers: input.authType === "headers" && Object.keys(input.headers).length ? encrypt(JSON.stringify(input.headers)) : null,
      })
      .returning({ id: schema.mcpServer.id });
    return Response.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}
