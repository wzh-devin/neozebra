CREATE TABLE "nm_email_accounts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nm_email_accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"email" text NOT NULL,
	"credentials" text NOT NULL,
	"cursor" jsonb,
	"last_synced_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "nm_email_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nm_email_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" bigint NOT NULL,
	"provider_id" text NOT NULL,
	"title" text NOT NULL,
	"sender" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text,
	"read" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "nm_email_accounts_owner_provider_email" ON "nm_email_accounts" USING btree ("owner_id","provider","email");--> statement-breakpoint
CREATE INDEX "nm_email_messages_account_provider" ON "nm_email_messages" USING btree ("account_id","provider_id");--> statement-breakpoint
CREATE INDEX "nm_email_messages_account_date" ON "nm_email_messages" USING btree ("account_id","received_at" DESC NULLS LAST,"id");