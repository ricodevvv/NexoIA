ALTER TABLE "attachment" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "storage_key" text;