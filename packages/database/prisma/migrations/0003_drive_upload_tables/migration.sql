-- CreateTable
CREATE TABLE "nm_drive_upload_tasks" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_id" TEXT NOT NULL,
    "connection_id" BIGINT NOT NULL,
    "connection_version" INTEGER NOT NULL,
    "public_id" TEXT NOT NULL,
    "parent_remote_id" TEXT NOT NULL,
    "directory_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "part_size" INTEGER NOT NULL,
    "part_count" INTEGER NOT NULL,
    "received_bytes" BIGINT NOT NULL DEFAULT 0,
    "transferred_bytes" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'receiving',
    "phase" TEXT NOT NULL DEFAULT 'receiving',
    "encrypted_checkpoint" TEXT,
    "error" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "nm_drive_upload_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nm_drive_upload_parts" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "task_id" BIGINT NOT NULL,
    "part_number" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,

    CONSTRAINT "nm_drive_upload_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nm_drive_upload_tasks_account" ON "nm_drive_upload_tasks"("owner_id", "connection_id", "id" DESC);

-- CreateIndex
CREATE INDEX "nm_drive_upload_tasks_public" ON "nm_drive_upload_tasks"("owner_id", "connection_id", "public_id");

-- CreateIndex
CREATE INDEX "nm_drive_upload_tasks_cleanup" ON "nm_drive_upload_tasks"("status", "expires_at");

-- CreateIndex
CREATE INDEX "nm_drive_upload_parts_task" ON "nm_drive_upload_parts"("task_id", "part_number");

