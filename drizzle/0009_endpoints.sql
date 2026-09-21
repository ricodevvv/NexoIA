CREATE TABLE "user_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key" text,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_endpoint" ADD CONSTRAINT "user_endpoint_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_endpoint_user_idx" ON "user_endpoint" USING btree ("user_id");