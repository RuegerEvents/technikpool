-- AlterTable
ALTER TABLE "Production" ADD COLUMN     "shareLinkActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareLinkVersion" INTEGER NOT NULL DEFAULT 0;
