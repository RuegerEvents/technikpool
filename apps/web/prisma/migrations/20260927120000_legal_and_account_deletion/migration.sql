-- CreateEnum
CREATE TYPE "LegalDocumentKind" AS ENUM ('IMPRINT', 'PRIVACY', 'TERMS');

-- DropForeignKey
ALTER TABLE "AssetTransaction" DROP CONSTRAINT "AssetTransaction_userId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogTransaction" DROP CONSTRAINT "CatalogTransaction_userId_fkey";

-- DropForeignKey
ALTER TABLE "Stocktake" DROP CONSTRAINT "Stocktake_createdById_fkey";

-- DropForeignKey
ALTER TABLE "StocktakeCount" DROP CONSTRAINT "StocktakeCount_userId_fkey";

-- DropForeignKey
ALTER TABLE "StocktakeEvent" DROP CONSTRAINT "StocktakeEvent_userId_fkey";

-- AlterTable
ALTER TABLE "AssetTransaction" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CatalogTransaction" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Stocktake" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StocktakeCount" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StocktakeEvent" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "externalUrl" TEXT,
    "body" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_kind_key" ON "LegalDocument"("kind");

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogTransaction" ADD CONSTRAINT "CatalogTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeCount" ADD CONSTRAINT "StocktakeCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeEvent" ADD CONSTRAINT "StocktakeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

