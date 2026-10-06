import { type AnyPgColumn, boolean, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { MessagePart, NativeTurn } from "@/lib/ai/types";

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp("created_at").notNull().defaultNow();
const updatedAt = () => timestamp("updated_at").notNull().defaultNow();

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  activeOrganizationId: text("active_organization_id"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("project_user_idx").on(t.userId, t.updatedAt)],
);

export const projectFile = pgTable(
  "project_file",
  {
    projectId: text("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
    attachmentId: text("attachment_id").notNull().references(() => attachment.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.attachmentId] })],
);

export const conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    title: text("title").notNull().default("Nuevo chat"),
    model: text("model").notNull(),
    starred: boolean("starred").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    temporary: boolean("temporary").notNull().default(false),
    currentLeafId: text("current_leaf_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conversation_user_idx").on(t.userId, t.updatedAt), index("conversation_project_idx").on(t.projectId)],
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => message.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    parts: jsonb("parts").$type<MessagePart[]>().notNull(),
    model: text("model"),
    native: jsonb("native").$type<NativeTurn | null>(),
    feedback: text("feedback", { enum: ["up", "down"] }),
    createdAt: createdAt(),
  },
  (t) => [index("message_conversation_idx").on(t.conversationId, t.createdAt), index("message_parent_idx").on(t.parentId)],
);

export const attachment = pgTable("attachment", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mediaType: text("media_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data"),
  storageKey: text("storage_key"),
  createdAt: createdAt(),
});

export const apiKey = pgTable("api_key", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["anthropic", "openai"] }).notNull(),
  secret: text("secret").notNull(),
  hint: text("hint").notNull(),
  createdAt: createdAt(),
});

export const mcpServer = pgTable("mcp_server", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  headers: text("headers"),
  authType: text("auth_type", { enum: ["headers", "oauth"] }).notNull().default("headers"),
  oauth: text("oauth"),
  oauthState: text("oauth_state").unique(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
});

export const subscription = pgTable("subscription", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: ["free", "pro"] }).notNull().default("free"),
  status: text("status").notNull().default("inactive"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  updatedAt: updatedAt(),
});

export const usage = pgTable(
  "usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    byok: boolean("byok").notNull().default(false),
    source: text("source", { enum: ["chat", "api", "playground", "code"] }).notNull().default("chat"),
    apiKeyId: text("api_key_id").references((): AnyPgColumn => platformKey.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    latencyMs: integer("latency_ms"),
    status: text("status", { enum: ["ok", "error"] }).notNull().default("ok"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("usage_user_idx").on(t.userId, t.createdAt), index("usage_api_key_idx").on(t.apiKeyId)],
);

export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  preferences: text("preferences").notNull().default(""),
  memoryEnabled: boolean("memory_enabled").notNull().default(true),
  artifactsEnabled: boolean("artifacts_enabled").notNull().default(true),
  codeEnabled: boolean("code_enabled").notNull().default(true),
  updatedAt: updatedAt(),
});

export const memory = pgTable(
  "memory",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("memory_user_idx").on(t.userId, t.createdAt)],
);

export type SharedMessage = { role: "user" | "assistant"; parts: MessagePart[]; model: string | null };

export const share = pgTable(
  "share",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    messages: jsonb("messages").$type<SharedMessage[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("share_conversation_idx").on(t.conversationId)],
);

export const responseStyle = pgTable(
  "response_style",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    instructions: text("instructions").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("response_style_user_idx").on(t.userId)],
);

export const rateLimit = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
  },
  (t) => [uniqueIndex("organization_slug_uidx").on(t.slug)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => [index("member_organizationId_idx").on(t.organizationId), index("member_userId_idx").on(t.userId)],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("invitation_organizationId_idx").on(t.organizationId), index("invitation_email_idx").on(t.email)],
);

export const orgSubscription = pgTable("org_subscription", {
  organizationId: text("organization_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("inactive"),
  seats: integer("seats").notNull().default(0),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  updatedAt: updatedAt(),
});

export const userEndpoint = pgTable(
  "user_endpoint",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    apiKey: text("api_key"),
    models: jsonb("models").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("user_endpoint_user_idx").on(t.userId)],
);

export const codeServer = pgTable(
  "code_server",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    username: text("username").notNull().default("nexocode"),
    password: text("password"),
    directory: text("directory"),
    createdAt: createdAt(),
  },
  (t) => [index("code_server_user_idx").on(t.userId)],
);

export const codeEnvironment = pgTable(
  "code_environment",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    network: text("network").notNull().default("trusted"),
    domains: text("domains").notNull().default(""),
    env: text("env"),
    setupScript: text("setup_script").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("code_environment_user_idx").on(t.userId)],
);

export const codeSession = pgTable(
  "code_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    environmentId: text("environment_id")
      .notNull()
      .references(() => codeEnvironment.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    repo: text("repo"),
    agentSessionId: text("agent_session_id"),
    prUrl: text("pr_url"),
    tokenHash: text("token_hash").notNull().unique(),
    token: text("token").notNull(),
    password: text("password").notNull(),
    lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("code_session_user_idx").on(t.userId), index("code_session_environment_idx").on(t.environmentId)],
);

export const githubConnection = pgTable("github_connection", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  githubId: integer("github_id").notNull(),
  login: text("login").notNull(),
  avatarUrl: text("avatar_url"),
  accessToken: text("access_token").notNull(),
  accessExpiresAt: timestamp("access_expires_at"),
  refreshToken: text("refresh_token"),
  refreshExpiresAt: timestamp("refresh_expires_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

export const platformKey = pgTable(
  "platform_key",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("platform_key_user_idx").on(t.userId, t.createdAt)],
);

export type PromptVariable = { name: string; description?: string };

export const prompt = pgTable(
  "prompt",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    system: text("system").notNull().default(""),
    content: text("content").notNull(),
    model: text("model"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    uses: integer("uses").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("prompt_user_idx").on(t.userId, t.updatedAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_user_idx").on(t.userId, t.createdAt), index("audit_log_org_idx").on(t.organizationId, t.createdAt)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (t) => [index("two_factor_secret_idx").on(t.secret), index("two_factor_user_idx").on(t.userId)],
);
