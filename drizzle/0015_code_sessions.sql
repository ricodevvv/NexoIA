CREATE TABLE "code_environment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"network" text DEFAULT 'trusted' NOT NULL,
	"domains" text DEFAULT '' NOT NULL,
	"env" text,
	"setup_script" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"title" text NOT NULL,
	"repo" text,
	"agent_session_id" text,
	"token_hash" text NOT NULL,
	"token" text NOT NULL,
	"password" text NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "code_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "code_environment" ADD CONSTRAINT "code_environment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_session" ADD CONSTRAINT "code_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_session" ADD CONSTRAINT "code_session_environment_id_code_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."code_environment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_environment_user_idx" ON "code_environment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "code_session_user_idx" ON "code_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "code_session_environment_idx" ON "code_session" USING btree ("environment_id");