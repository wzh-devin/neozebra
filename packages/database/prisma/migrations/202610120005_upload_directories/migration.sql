-- AlterTable
ALTER TABLE "nm_drive_upload_tasks" ADD COLUMN     "directory_path" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "resolved_parent_remote_id" TEXT;

