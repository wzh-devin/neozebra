-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "nm_email_accounts" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "cursor" JSONB,
    "last_synced_at" TIMESTAMPTZ(6),
    "error" TEXT,

    CONSTRAINT "nm_email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nm_email_messages" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_id" BIGINT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "body" TEXT,
    "body_format" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "nm_email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nm_task_workspaces" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "nm_task_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nm_task_projects" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" BIGINT NOT NULL,
    "business_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "deadline_date" TIMESTAMPTZ(6),
    "archived" BOOLEAN NOT NULL,

    CONSTRAINT "nm_task_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nm_task_sections" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" BIGINT NOT NULL,
    "business_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "project_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "nm_task_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nm_tasks" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" BIGINT NOT NULL,
    "business_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "planned_date" TIMESTAMPTZ(6),
    "deadline_date" TIMESTAMPTZ(6),
    "project_key" TEXT,
    "section_key" TEXT,
    "labels" JSONB NOT NULL,
    "estimate_minutes" INTEGER,
    "is_pinned" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "nm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nm_task_subtasks" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" BIGINT NOT NULL,
    "business_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "task_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL,

    CONSTRAINT "nm_task_subtasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nm_drive_connections" (
    "id" BIGSERIAL NOT NULL,
    "owner_id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mount_options" JSONB NOT NULL,
    "encrypted_credentials" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "last_checked_at" TIMESTAMPTZ(6) NOT NULL,
    "token_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nm_drive_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nm_email_accounts_owner_provider_email" ON "nm_email_accounts"("owner_id", "provider", "email");

-- CreateIndex
CREATE INDEX "nm_email_messages_account_provider" ON "nm_email_messages"("account_id", "provider_id");

-- CreateIndex
CREATE INDEX "nm_email_messages_account_date" ON "nm_email_messages"("account_id", "received_at" DESC, "id");

-- CreateIndex
CREATE INDEX "nm_task_workspaces_owner" ON "nm_task_workspaces"("owner_id");

-- CreateIndex
CREATE INDEX "nm_task_projects_workspace_key" ON "nm_task_projects"("workspace_id", "business_key");

-- CreateIndex
CREATE INDEX "nm_task_sections_workspace_key" ON "nm_task_sections"("workspace_id", "business_key");

-- CreateIndex
CREATE INDEX "nm_tasks_workspace_key" ON "nm_tasks"("workspace_id", "business_key");

-- CreateIndex
CREATE INDEX "nm_task_subtasks_workspace_task_key" ON "nm_task_subtasks"("workspace_id", "task_key", "business_key");

-- CreateIndex
CREATE INDEX "nm_drive_connections_owner_idx" ON "nm_drive_connections"("owner_id", "public_id");
