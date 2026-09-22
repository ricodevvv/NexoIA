export type ProviderId = "anthropic" | "openai" | "compat";

export type FileRef = { attachmentId: string; name: string; mediaType: string };

export type Effort = "low" | "medium" | "high";

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "attachment"; attachmentId: string; name: string; mediaType: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      input: unknown;
      output?: string;
      isError?: boolean;
      server?: boolean;
      files?: FileRef[];
      diff?: string;
    }
  | { type: "notice"; level: "warning" | "error"; text: string };

export type NativeTurn = {
  provider: ProviderId;
  model: string;
  items: unknown[];
};

export type AttachmentData = {
  id: string;
  name: string;
  mediaType: string;
  data: Buffer;
};

export type HistoryMessage = {
  role: "user" | "assistant";
  parts: MessagePart[];
  model?: string | null;
  native?: NativeTurn | null;
};

export type Quota = { used: number; limit: number; plan: "free" | "pro"; resetsAt: string };

export type ToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolCall = { id: string; name: string; input: unknown };

export type ToolResult = { id: string; name: string; output: string; isError: boolean; files?: FileRef[] };

export type Usage = { inputTokens: number; outputTokens: number };

export type ProviderEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_call"; call: ToolCall; server?: boolean }
  | { type: "tool_result"; result: ToolResult; server?: boolean }
  | { type: "notice"; level: "warning" | "error"; text: string };

export type StepResult = {
  toolCalls: ToolCall[];
  paused: boolean;
  usage: Usage;
};

export type SessionOptions = {
  model: ModelInfo;
  apiKey: string;
  system: string;
  history: HistoryMessage[];
  attachments: Map<string, AttachmentData>;
  tools: ToolSpec[];
  effort: Effort;
  webSearch: boolean;
  research: boolean;
};

export interface ProviderSession {
  step(signal: AbortSignal): AsyncGenerator<ProviderEvent, StepResult>;
  addToolResults(results: ToolResult[]): void;
  nativeTurn(): NativeTurn;
}

export type ModelInfo = {
  id: string;
  provider: ProviderId;
  label: string;
  description: string;
  tier: "free" | "pro";
  vision: boolean;
  pdf: boolean;
  reasoning: "adaptive" | "budget" | "openai" | "none";
  webSearch: "web_search_20260209" | "web_search_20250305" | "openai" | null;
  webFetch: "web_fetch_20260209" | "web_fetch_20250910" | null;
  fallbacks: boolean;
  maxOutput: number;
  baseURL?: string;
  endpointId?: string;
  group?: string;
};

export type ChatStreamEvent =
  | { type: "start"; conversationId: string; userMessageId: string; assistantMessageId: string }
  | { type: "title"; title: string }
  | ProviderEvent
  | { type: "done"; usage: Usage; quota?: Quota }
  | { type: "error"; message: string };
