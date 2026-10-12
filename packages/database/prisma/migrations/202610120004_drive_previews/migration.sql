-- CreateTable
CREATE TABLE "nm_drive_preview_tasks" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_id" TEXT NOT NULL,
    "connection_id" BIGINT NOT NULL,
    "connection_version" INTEGER NOT NULL,
    "public_id" TEXT NOT NULL,
    "remote_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "content_hash" TEXT,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "error" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nm_drive_preview_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nm_drive_preview_tasks_owner" ON "nm_drive_preview_tasks"("owner_id", "connection_id", "public_id");

-- CreateIndex
CREATE INDEX "nm_drive_preview_tasks_cleanup" ON "nm_drive_preview_tasks"("status", "expires_at");

