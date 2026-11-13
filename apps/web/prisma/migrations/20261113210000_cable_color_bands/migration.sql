-- CreateTable
CREATE TABLE "CableColorBand" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "maxLengthCm" INTEGER NOT NULL,
    "paletteKey" TEXT,
    "customName" TEXT,
    "customHex" TEXT,

    CONSTRAINT "CableColorBand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CableColorBand_organizationId_maxLengthCm_key" ON "CableColorBand"("organizationId", "maxLengthCm");

-- AddForeignKey
ALTER TABLE "CableColorBand" ADD CONSTRAINT "CableColorBand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
