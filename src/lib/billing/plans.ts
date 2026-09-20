export type PlanId = "free" | "pro";

export const TEAM_PLAN = {
  name: "Team",
  price: "$25/asiento/mes",
  features: [
    "Todo lo de Pro para cada miembro",
    "Proyectos y conectores compartidos",
    "Panel de uso por miembro",
    "Se cobra por asiento, ajustado solo",
  ],
};

export type Plan = {
  id: PlanId;
  name: string;
  price: string;
  dailyMessages: number;
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    dailyMessages: 25,
    features: ["25 mensajes al día", "Modelos rápidos", "Conectores MCP", "Trae tu propia API key sin límites"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "$20/mes",
    dailyMessages: 500,
    features: ["500 mensajes al día", "Todos los modelos", "Razonamiento a fondo", "Soporte prioritario"],
  },
};
