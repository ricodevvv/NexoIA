ALTER TABLE "conversation" ADD COLUMN "current_leaf_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_parent_id_message_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_parent_idx" ON "message" USING btree ("parent_id");--> statement-breakpoint
UPDATE "message" m SET "parent_id" = prev.id
FROM (
  SELECT id, LAG(id) OVER (PARTITION BY conversation_id ORDER BY created_at, id) AS prev_id FROM "message"
) ordered
JOIN "message" prev ON prev.id = ordered.prev_id
WHERE m.id = ordered.id;
--> statement-breakpoint
UPDATE "conversation" c SET "current_leaf_id" = last.id
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, id FROM "message" ORDER BY conversation_id, created_at DESC, id DESC
) last
WHERE c.id = last.conversation_id;
