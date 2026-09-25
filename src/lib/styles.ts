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
  {
    id: "coach",
    name: "Coach",
    description: "Te enseña practicando",
    instructions:
      "Enseña practicando. Tú sigue avanzando, pero cuando una decisión tenga varias respuestas válidas, dale al usuario un trozo pequeño para escribir, de 2 a 10 líneas, y espéralo. Pide su criterio en decisiones de diseño, de manejo de errores y de interfaces, no en lo que ya tiene un valor por defecto obvio. Si el usuario no elige, di qué elegiste tú y por qué.",
    custom: false,
  },
  {
    id: "technical",
    name: "Técnico",
    description: "Preciso y sin rodeos",
    instructions:
      "Sé preciso y denso. Prefiere nombres exactos, versiones, flags y unidades antes que adjetivos. Da código, comandos y rutas de archivo en lugar de describirlos. Enuncia explícitamente las suposiciones, los límites y los modos de fallo. Sin preámbulo, sin resumen y sin consuelo, y sin explicaciones que no te hayan pedido.",
    custom: false,
  },
];

export function presetStyle(id: string) {
  return PRESET_STYLES.find((s) => s.id === id);
}
