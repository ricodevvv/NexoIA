import { desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { visibleProjectsFilter } from "@/lib/projects";
import { apiSession, apiUser, handleError, HttpError } from "@/lib/session";
import { activeWorkspace } from "@/lib/workspace";

const Create = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  shared: z.boolean().default(false),
});

export async function GET() {
  try {
    const user = await apiUser();
    const rows = await db
      .select({
        id: schema.project.id,
        name: schema.project.name,
        description: schema.project.description,
        updatedAt: schema.project.updatedAt,
      })
      .from(schema.project)
      .where(await visibleProjectsFilter(user.id))
      .orderBy(desc(schema.project.updatedAt));
    return Response.json(rows);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await apiSession();
    const { shared, ...data } = Create.parse(await request.json());
    const workspace = shared ? await activeWorkspace(auth) : null;
    if (shared && !workspace) throw new HttpError(400, "Activa un equipo para crear proyectos compartidos");
    const [row] = await db
      .insert(schema.project)
      .values({ id: nanoid(), userId: auth.user.id, organizationId: workspace?.id ?? null, ...data })
      .returning({ id: schema.project.id });
    return Response.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}
