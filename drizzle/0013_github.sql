CREATE TABLE "github_connection" (
	"user_id" text PRIMARY KEY NOT NULL,
	"github_id" integer NOT NULL,
	"login" text NOT NULL,
	"avatar_url" text,
	"access_token" text NOT NULL,
	"access_expires_at" timestamp,
	"refresh_token" text,
	"refresh_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_connection" ADD CONSTRAINT "github_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;