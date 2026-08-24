-- CreateTable
CREATE TABLE "BundleTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BundleTemplate" ADD CONSTRAINT "BundleTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleTemplate" ADD CONSTRAINT "BundleTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one template per existing bundle, reusing the bundle's own id as
-- the template id (existing AssetBundle rows keep their own id for the
-- instance row created below).
INSERT INTO "BundleTemplate" ("id", "name", "description", "organizationId", "categoryId", "createdAt", "updatedAt")
SELECT "id", "name", "description", "organizationId", "categoryId", "createdAt", "updatedAt" FROM "AssetBundle";

-- AlterTable
ALTER TABLE "AssetBundle" ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "tag" TEXT;

-- Backfill: instances point at the template created from their own former row.
UPDATE "AssetBundle" SET "templateId" = "id";

-- DropForeignKey
ALTER TABLE "AssetBundle" DROP CONSTRAINT "AssetBundle_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "AssetBundle" DROP CONSTRAINT "AssetBundle_categoryId_fkey";

-- AlterTable
ALTER TABLE "AssetBundle" DROP COLUMN "name",
DROP COLUMN "description",
DROP COLUMN "organizationId",
DROP COLUMN "categoryId",
ALTER COLUMN "templateId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "AssetBundle" ADD CONSTRAINT "AssetBundle_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BundleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "AssetBundle_tag_key" ON "AssetBundle"("tag");
