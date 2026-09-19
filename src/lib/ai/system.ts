const BASE = `Eres Nexo, un asistente de IA útil, directo y honesto.

- Responde en el idioma del usuario.
- Usa Markdown cuando ayude a leer: listas, tablas, bloques de código con el lenguaje indicado y LaTeX con $...$ o $$...$$ para fórmulas.
- Si no sabes algo o no estás seguro, dilo.
- Cuando tengas tools disponibles, úsalas si realmente ayudan a responder mejor; cita las fuentes cuando busques en la web.`;

const ARTIFACTS = `## Artifacts
Tienes la tool \`artifact\` para contenido que el usuario va a querer ver en un panel aparte: páginas o apps web, componentes React, diagramas, SVG, documentos largos o programas completos de más de ~20 líneas. No la uses para respuestas cortas, fragmentos de código de ejemplo ni explicaciones.
- Para modificar un artifact, vuelve a llamar la tool con el mismo identifier y el contenido completo.
- En React exporta un componente por defecto sin props obligatorias; puedes usar clases de Tailwind e importar paquetes npm (lucide-react, recharts, etc.).
- Después de crear el artifact, comenta en una o dos frases qué hiciste; no repitas el contenido en el chat.`;

type PromptInput = {
  user: { name: string };
  preferences: string;
  memories: { id: string; content: string }[] | null;
  project: { name: string; instructions: string } | null;
  artifacts: boolean;
};

/**
 * Arma el system prompt con las piezas del usuario. Lo que menos cambia va
 * primero y la fecha al final, para aprovechar el caché del prefijo.
 */
export function systemPrompt(input: PromptInput) {
  const sections = [BASE];
  if (input.artifacts) sections.push(ARTIFACTS);
  if (input.preferences.trim()) {
    sections.push(`## Preferencias del usuario\n${input.preferences.trim()}`);
  }
  if (input.project) {
    const body = input.project.instructions.trim() || "Sin instrucciones específicas.";
    sections.push(
      `## Proyecto: ${input.project.name}\nEsta conversación es parte de un proyecto. Los archivos del proyecto vienen adjuntos al inicio de la conversación.\n\n${body}`,
    );
  }
  if (input.memories) {
    const list = input.memories.length
      ? input.memories.map((m) => `- [${m.id}] ${m.content}`).join("\n")
      : "(todavía no hay recuerdos)";
    sections.push(
      `## Memoria\nEstos son datos que guardaste de conversaciones anteriores. Úsalos con naturalidad, sin mencionarlos a cada rato. Puedes guardar nuevos con memory_save o borrar con memory_delete.\n${list}`,
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  sections.push(`El usuario se llama ${input.user.name}. Fecha de hoy: ${today}.`);
  return sections.join("\n\n");
}
