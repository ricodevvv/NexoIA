import { and, desc, eq, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { logError } from "@/lib/log";
import { clientIp } from "@/lib/rate-limit";
import type { AuditAction } from "./audit-labels";

export type AuditEntry = {
  userId: string | null;
  action: AuditAction;
  organizationId?: string | null;
  target?: string | null;
  metadata?: Record<string, unknown>;
  headers?: Headers | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Deja constancia de una acción sensible: quién, qué, sobre qué y desde dónde.
 * Nunca rompe la petición que la llama; si falla solo se registra el error.
 */
export async function audit(entry: AuditEntry) {
  try {
    await db.insert(schema.auditLog).values({
      id: nanoid(),
      userId: entry.userId,
      organizationId: entry.organizationId ?? null,
      action: entry.action,
      target: entry.target?.slice(0, 200) ?? null,
      metadata: entry.metadata ?? {},
      ip: entry.ip ?? (entry.headers ? clientIp(entry.headers) : null),
      userAgent: (entry.userAgent ?? entry.headers?.get("user-agent") ?? null)?.slice(0, 300) ?? null,
    });
  } catch (err) {
    logError("audit", err, { action: entry.action });
  }
}

export type AuditRow = {
  id: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};

/**
 * Página de eventos hechos por un usuario o dentro de un equipo, del más nuevo
 * al más viejo. `before` es el `createdAt` del último que ya se mostró.
 */
export async function listAudit(scope: { userId: string } | { organizationId: string }, opts: { limit?: number; before?: Date } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const where =
    "organizationId" in scope
      ? eq(schema.auditLog.organizationId, scope.organizationId)
      : eq(schema.auditLog.userId, scope.userId);
  const rows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      target: schema.auditLog.target,
      metadata: schema.auditLog.metadata,
      ip: schema.auditLog.ip,
      userAgent: schema.auditLog.userAgent,
      createdAt: schema.auditLog.createdAt,
      actorId: schema.user.id,
      actorName: schema.user.name,
      actorEmail: schema.user.email,
    })
    .from(schema.auditLog)
    .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.userId))
    .where(and(where, opts.before ? lt(schema.auditLog.createdAt, opts.before) : undefined))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
  return rows.map(
    (r): AuditRow => ({
      id: r.id,
      action: r.action,
      target: r.target,
      metadata: r.metadata,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
      actor: r.actorId ? { id: r.actorId, name: r.actorName ?? "", email: r.actorEmail ?? "" } : null,
    }),
  );
}
