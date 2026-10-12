-- AlterTable
ALTER TABLE "nm_drive_connections" ADD COLUMN     "metadata_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sync_active_until" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "nm_drive_directories" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connection_id" BIGINT NOT NULL,
    "connection_version" INTEGER NOT NULL,
    "remote_id" TEXT NOT NULL,
    "parent_remote_id" TEXT NOT NULL,
    "path" JSONB NOT NULL,
    "published_generation" TEXT,
    "scan_generation" TEXT,
    "scan_cursor" TEXT,
    "requested_revision" INTEGER NOT NULL DEFAULT 0,
    "scan_revision" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "last_synced_at" TIMESTAMPTZ(6),
    "next_sync_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_until" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),
    "error" TEXT,

    CONSTRAINT "nm_drive_directories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nm_drive_entries" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connection_id" BIGINT NOT NULL,
    "connection_version" INTEGER NOT NULL,
    "directory_id" BIGINT NOT NULL,
    "remote_id" TEXT NOT NULL,
    "parent_remote_id" TEXT NOT NULL,
    "generation" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "remote_modified_at" TIMESTAMPTZ(6),
    "mime_type" TEXT,

    CONSTRAINT "nm_drive_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nm_drive_directories_connection_remote" ON "nm_drive_directories"("connection_id", "connection_version", "remote_id");

-- CreateIndex
CREATE INDEX "nm_drive_directories_parent" ON "nm_drive_directories"("connection_id", "connection_version", "parent_remote_id");

-- CreateIndex
CREATE INDEX "nm_drive_directories_due" ON "nm_drive_directories"("state", "next_sync_at");

-- CreateIndex
CREATE INDEX "nm_drive_entries_listing" ON "nm_drive_entries"("directory_id", "generation", "name", "id");

-- CreateIndex
CREATE INDEX "nm_drive_entries_remote" ON "nm_drive_entries"("connection_id", "connection_version", "remote_id");

