#!/usr/bin/env bash
# Regenerates the Play Store graphics that aren't screenshots.
#
# The icon comes from brand/mark.svg like every other icon in the repo — see
# scripts/brand.sh. Play wants 512x512 and applies its own rounding, so the
# full-bleed master is the right input here too.
#
# Needs rsvg-convert and magick (brew install librsvg imagemagick).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../../.." && pwd)"
mark="$root/brand/mark.svg"
fonts="$root/apps/scanner/assets/fonts"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for tool in rsvg-convert magick; do
	command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 1; }
done

# --- app icon: 512x512, full bleed ----------------------------------------
rsvg-convert -w 512 -h 512 "$mark" -o "$tmp/icon.png"
magick "$tmp/icon.png" -colorspace sRGB "PNG32:$here/icon-512.png"

# --- feature graphic: 1024x500 --------------------------------------------
# Google crops this on some surfaces and lays a play button over the middle of
# the video variant, so everything stays left of centre and well inside the
# edges. The tile is dropped — the graphic's own background is the tile.
grep -vF '<rect width="1024" height="1024" fill="#171717"/>' "$mark" > "$tmp/bare.svg"
rsvg-convert -w 168 -h 168 "$tmp/bare.svg" -o "$tmp/mark.png"

magick -size 1024x500 xc:'#171717' \
	"$tmp/mark.png" -geometry +72+166 -composite \
	-font "$fonts/Inter-Bold.ttf"    -pointsize 62 -fill '#fafafa' \
	-annotate +272+242 'Technikpool Scanner' \
	-font "$fonts/Inter-Regular.ttf" -pointsize 26 -fill '#a3a3a3' \
	-annotate +272+298 'Lagerbewegungen scannen, statt sie aufzuschreiben.' \
	-colorspace sRGB -type TrueColor -depth 8 \
	"PNG24:$here/feature-graphic.png"

echo "wrote $here/icon-512.png $here/feature-graphic.png"
