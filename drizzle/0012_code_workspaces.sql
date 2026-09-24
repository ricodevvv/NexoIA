CREATE TABLE "code_workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"token" text NOT NULL,
	"password" text NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "code_workspace_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "code_workspace_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "code_workspace" ADD CONSTRAINT "code_workspace_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;