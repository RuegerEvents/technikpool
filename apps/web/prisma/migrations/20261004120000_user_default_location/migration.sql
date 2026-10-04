-- Where one user's new units of one org go by default: the star in the
-- location picker. One per user and org; gone with any of the three.
CREATE TABLE "UserDefaultLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDefaultLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDefaultLocation_userId_organizationId_key" ON "UserDefaultLocation"("userId", "organizationId");

CREATE INDEX "UserDefaultLocation_locationId_idx" ON "UserDefaultLocation"("locationId");

ALTER TABLE "UserDefaultLocation" ADD CONSTRAINT "UserDefaultLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserDefaultLocation" ADD CONSTRAINT "UserDefaultLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserDefaultLocation" ADD CONSTRAINT "UserDefaultLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
