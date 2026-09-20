export type StyleOption = { id: string; name: string; description: string; instructions: string; custom: boolean };

export const PRESET_STYLES: StyleOption[] = [
  {
    id: "normal",
    name: "Normal",
    description: "Respuestas por defecto",
    instructions: "",
    custom: false,
  },
  {
    id: "concise",
    name: "Conciso",
    description: "Corto y al grano",
    instructions:
      "Responde de la forma más breve posible sin perder lo esencial. Nada de introducciones, resúmenes al final ni relleno. Usa listas solo si ahorran palabras.",
    custom: false,
  },
  {
    id: "explanatory",
    name: "Explicativo",
    description: "Para aprender a fondo",
    instructions:
      "Explica como un buen profesor: construye desde lo básico, da el porqué de cada paso, usa analogías y ejemplos concretos, y cierra señalando errores comunes o cómo seguir profundizando.",
    custom: false,
  },
  {
    id: "formal",
    name: "Formal",
    description: "Claro y profesional",
    instructions:
      "Usa un tono formal y profesional, trato de usted, estructura clara con encabezados cuando ayude, y un lenguaje preciso sin coloquialismos ni emojis.",
    custom: false,
  },
];

export function presetStyle(id: string) {
  return PRESET_STYLES.find((s) => s.id === id);
}
