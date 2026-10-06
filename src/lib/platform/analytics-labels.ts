export type Source = "chat" | "api" | "playground" | "code";

export const SOURCE_LABEL: Record<Source, string> = {
  chat: "Chat",
  api: "API",
  playground: "Playground",
  code: "Nexo Code",
};
