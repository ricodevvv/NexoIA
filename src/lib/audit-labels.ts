export const AUDIT_LABELS = {
  "auth.sign_in": "Inició sesión",
  "auth.sign_up": "Creó su cuenta",
  "auth.password_changed": "Cambió la contraseña",
  "auth.two_factor_enabled": "Activó la verificación en dos pasos",
  "auth.two_factor_disabled": "Desactivó la verificación en dos pasos",
  "auth.session_revoked": "Cerró una sesión",
  "auth.sessions_revoked": "Cerró las demás sesiones",
  "account.updated": "Actualizó su perfil",
  "account.exported": "Exportó sus datos",
  "platform_key.created": "Creó una API key",
  "platform_key.revoked": "Revocó una API key",
  "provider_key.saved": "Guardó una key de proveedor",
  "provider_key.removed": "Quitó una key de proveedor",
  "connector.added": "Agregó un conector",
  "connector.removed": "Quitó un conector",
  "conversation.shared": "Compartió un chat",
  "conversation.unshared": "Dejó de compartir un chat",
  "conversations.deleted": "Borró chats en bloque",
  "memory.cleared": "Borró la memoria",
  "prompt.created": "Creó un prompt",
  "prompt.deleted": "Borró un prompt",
  "member.invited": "Invitó a alguien al equipo",
  "member.removed": "Sacó a alguien del equipo",
  "member.role_changed": "Cambió el rol de un miembro",
} as const;

export type AuditAction = keyof typeof AUDIT_LABELS;

export type AuditCategory = "auth" | "keys" | "data" | "team" | "connectors";

/**
 * Agrupa las acciones para los filtros de la vista de actividad.
 */
export function auditCategory(action: string): AuditCategory {
  if (action.startsWith("auth.") || action.startsWith("account.updated")) return "auth";
  if (action.startsWith("platform_key.") || action.startsWith("provider_key.")) return "keys";
  if (action.startsWith("member.")) return "team";
  if (action.startsWith("connector.")) return "connectors";
  return "data";
}

export function auditLabel(action: string) {
  return AUDIT_LABELS[action as AuditAction] ?? action;
}
