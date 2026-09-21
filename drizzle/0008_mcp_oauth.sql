ALTER TABLE "mcp_server" ADD COLUMN "auth_type" text DEFAULT 'headers' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN "oauth" text;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN "oauth_state" text;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD CONSTRAINT "mcp_server_oauth_state_unique" UNIQUE("oauth_state");