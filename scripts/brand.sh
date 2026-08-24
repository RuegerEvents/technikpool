#!/usr/bin/env bash
# Regenerates every icon in the repo from brand/mark.svg, the single master.
#
# Run after changing the mark:
#   ./scripts/brand.sh
#
# Needs rsvg-convert and magick (brew install librsvg imagemagick).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

mark="brand/mark.svg"
web="apps/web/static"
icons="apps/scanner/assets/icon"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for tool in rsvg-convert magick; do
	command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 1; }
done

mkdir -p "$web" "$icons"

# --- web -------------------------------------------------------------------
# The master is full-bleed so the platforms can apply their own corner mask; a
# browser tab applies none, so the favicon is the one place that rounds itself.
plain='<rect width="1024" height="1024" fill="#171717"/>'
rounded='<rect width="1024" height="1024" rx="180" fill="#171717"/>'
sed "s|$plain|$rounded|" "$mark" > "$web/favicon.svg"
grep -q 'rx="180"' "$web/favicon.svg" || { echo "favicon: rect not matched, check mark.svg" >&2; exit 1; }

# iOS masks a home-screen bookmark the same way it masks an app icon, so this
# one stays square.
rsvg-convert -w 180 -h 180 "$mark" -o "$web/apple-touch-icon.png"

# --- scanner ---------------------------------------------------------------
rsvg-convert -w 1024 -h 1024 "$mark" -o "$icons/icon.png"

# Android adaptive icons crop the foreground to a mask the device chooses, so
# only the circle inscribed in the central 66% is guaranteed to survive. Do NOT
# shrink the mark to fit that here: flutter_launcher_icons wraps this image in
# its own `android:inset="16%"`, which already scales it to 68%. Pre-scaling as
# well applies the inset twice and leaves the mark at a third of the icon.
#
# Full-bleed is the right input. The mark's circumscribed circle is 92% of the
# canvas (the rounded bracket corners reach 471 of 512 from centre), so after
# the 16% inset it lands at 63% — inside the 66% the round mask keeps.
#
# Only the tile is dropped; the background is a flat colour in the adaptive
# config.
grep -vF "$plain" "$mark" > "$tmp/bare.svg"
rsvg-convert -w 1024 -h 1024 "$tmp/bare.svg" -o "$icons/icon-foreground.png"

echo "wrote $web/favicon.svg $web/apple-touch-icon.png $icons/icon.png $icons/icon-foreground.png"
echo "now: cd apps/scanner && dart run flutter_launcher_icons"
