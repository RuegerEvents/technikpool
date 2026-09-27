-- AlterEnum
ALTER TYPE "LegalDocumentKind" ADD VALUE 'DPA';

-- CreateTable
CREATE TABLE "DpaAcceptance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "versionHash" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "orgAddress" TEXT,
    "pdfPath" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DpaAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DpaAcceptance_organizationId_acceptedAt_idx" ON "DpaAcceptance"("organizationId", "acceptedAt");

-- AddForeignKey
ALTER TABLE "DpaAcceptance" ADD CONSTRAINT "DpaAcceptance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DpaAcceptance" ADD CONSTRAINT "DpaAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

