-- Software licences: a product flag, and the sealed credentials of each unit in
-- a table of their own so no existing asset query can carry them anywhere.

ALTER TABLE "Product" ADD COLUMN "isLicense" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "LicenseCredential" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LicenseCredential_assetId_key" ON "LicenseCredential"("assetId");

ALTER TABLE "LicenseCredential"
ADD CONSTRAINT "LicenseCredential_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
