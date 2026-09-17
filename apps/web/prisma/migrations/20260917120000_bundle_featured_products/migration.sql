-- ── Main devices of a bundle ─────────────────────────────────────────────────
-- Which products a kit is actually built around, so the generated preview can
-- draw those large and everything else small. Per template, because two cases
-- built to the same spec are the same kit.

CREATE TABLE "_BundleTemplateFeaturedProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BundleTemplateFeaturedProducts_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_BundleTemplateFeaturedProducts_B_index"
ON "_BundleTemplateFeaturedProducts"("B");

ALTER TABLE "_BundleTemplateFeaturedProducts"
ADD CONSTRAINT "_BundleTemplateFeaturedProducts_A_fkey"
FOREIGN KEY ("A") REFERENCES "BundleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_BundleTemplateFeaturedProducts"
ADD CONSTRAINT "_BundleTemplateFeaturedProducts_B_fkey"
FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
