const MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Revisa los datos: hay un campo con un formato inválido.",
  INVALID_EMAIL: "Ese correo no es válido.",
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  USER_ALREADY_EXISTS: "Ya hay una cuenta con ese correo. Inicia sesión.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya hay una cuenta con ese correo. Inicia sesión.",
  PASSWORD_TOO_SHORT: "La contraseña es muy corta: usa al menos 8 caracteres.",
  PASSWORD_TOO_LONG: "La contraseña es demasiado larga.",
  INVALID_PASSWORD: "La contraseña actual no es correcta.",
  INVALID_TOKEN: "El enlace no es válido o ya caducó.",
  EMAIL_NOT_VERIFIED: "Confirma tu correo antes de entrar.",
  TOO_MANY_REQUESTS: "Demasiados intentos. Espera un momento y vuelve a probar.",
  ORGANIZATION_ALREADY_EXISTS: "Ya existe un equipo con ese nombre.",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "Esa persona ya es miembro del equipo.",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "Esa persona ya tiene una invitación pendiente.",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: "No tienes permiso para invitar gente a este equipo.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: "Eres el único dueño: transfiere el equipo o elimínalo.",
};

/**
 * Pasa los errores de Better Auth (en inglés y con prefijos técnicos) a un
 * mensaje en español que se pueda mostrar tal cual.
 */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined, fallback = "No se pudo completar. Intenta de nuevo.") {
  if (!error) return fallback;
  if (error.status === 429) return MESSAGES.TOO_MANY_REQUESTS;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return fallback;
}
