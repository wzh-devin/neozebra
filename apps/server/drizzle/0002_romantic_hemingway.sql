CREATE TABLE "nm_task_projects" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nm_task_projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"business_key" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"deadline_date" timestamp with time zone,
	"archived" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nm_task_sections" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nm_task_sections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"business_key" text NOT NULL,
	"position" integer NOT NULL,
	"project_key" text NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nm_task_subtasks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nm_task_subtasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"business_key" text NOT NULL,
	"position" integer NOT NULL,
	"task_key" text NOT NULL,
	"title" text NOT NULL,
	"completed" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nm_task_workspaces" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nm_task_workspaces_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nm_tasks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nm_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"business_key" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"planned_date" timestamp with time zone,
	"deadline_date" timestamp with time zone,
	"project_key" text,
	"section_key" text,
	"labels" jsonb NOT NULL,
	"estimate_minutes" integer,
	"is_pinned" boolean NOT NULL,
	"source" text NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "nm_task_projects_workspace_key" ON "nm_task_projects" USING btree ("workspace_id","business_key");--> statement-breakpoint
CREATE INDEX "nm_task_sections_workspace_key" ON "nm_task_sections" USING btree ("workspace_id","business_key");--> statement-breakpoint
CREATE INDEX "nm_task_subtasks_workspace_task_key" ON "nm_task_subtasks" USING btree ("workspace_id","task_key","business_key");--> statement-breakpoint
CREATE INDEX "nm_task_workspaces_owner" ON "nm_task_workspaces" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "nm_tasks_workspace_key" ON "nm_tasks" USING btree ("workspace_id","business_key");