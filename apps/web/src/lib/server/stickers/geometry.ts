/** Default bleed; configurable per generation (see config.ts). */
export const DEFAULT_BLEED_MM = 1.5;
export const CORNER_RADIUS_MM = 3;
/** Minimum spacing required between adjacent stickers' bleed edges (not their cut lines). */
export const MIN_BLEED_GAP_MM = 1.5;
export const SAFETY_MARGIN_MM = 3;
export const MIN_STICKER_SIZE_MM = 10;
/** Flag tail half-height, as a fraction of the sticker's full height. */
export const FLAG_TAIL_HALF_HEIGHT_RATIO = 0.16;

/** The minimum cut-line-to-cut-line gap that keeps bleeds from overlapping and meets MIN_BLEED_GAP_MM. */
export function minCutLineGapMm(bleedMm: number): number {
	return 2 * bleedMm + MIN_BLEED_GAP_MM;
}

export type PathCommand =
	| { op: 'M'; x: number; y: number }
	| { op: 'L'; x: number; y: number }
	| { op: 'C'; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number }
	| { op: 'Z' };

const KAPPA = 0.5522847498307936;

/** Cubic-bezier approximation of a quarter-circle arc, swept counter-clockwise from startDeg to startDeg+90. */
function quarterArc(
	cx: number,
	cy: number,
	r: number,
	startDeg: number,
	endDeg: number
): PathCommand {
	const t0 = (startDeg * Math.PI) / 180;
	const t1 = (endDeg * Math.PI) / 180;
	const p0x = cx + r * Math.cos(t0);
	const p0y = cy + r * Math.sin(t0);
	const p3x = cx + r * Math.cos(t1);
	const p3y = cy + r * Math.sin(t1);
	const k = KAPPA * r;
	return {
		op: 'C',
		x1: p0x - k * Math.sin(t0),
		y1: p0y + k * Math.cos(t0),
		x2: p3x + k * Math.sin(t1),
		y2: p3y - k * Math.cos(t1),
		x3: p3x,
		y3: p3y
	};
}

/**
 * Bezier fillet at a corner, given the unit incoming/outgoing edge directions
 * (the direction of travel arriving at, and leaving, the corner). Works
 * uniformly for convex corners (rounding them) and concave/reflex corners
 * (like the flag's tail notches) — the same tangent-preserving construction
 * is correct either way; only the resulting curvature differs.
 */
function fillet(
	cornerX: number,
	cornerY: number,
	inDx: number,
	inDy: number,
	outDx: number,
	outDy: number,
	r: number
): PathCommand {
	const startX = cornerX - inDx * r;
	const startY = cornerY - inDy * r;
	const endX = cornerX + outDx * r;
	const endY = cornerY + outDy * r;
	const k = KAPPA * r;
	return {
		op: 'C',
		x1: startX + inDx * k,
		y1: startY + inDy * k,
		x2: endX - outDx * k,
		y2: endY - outDy * k,
		x3: endX,
		y3: endY
	};
}

/** Rounded-rectangle outline, traced counter-clockwise starting at the bottom edge. */
export function roundedRectPath(
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): PathCommand[] {
	const radius = Math.min(r, w / 2, h / 2);
	return [
		{ op: 'M', x: x + radius, y },
		{ op: 'L', x: x + w - radius, y },
		fillet(x + w, y, 1, 0, 0, 1, radius),
		{ op: 'L', x: x + w, y: y + h - radius },
		fillet(x + w, y + h, 0, 1, -1, 0, radius),
		{ op: 'L', x: x + radius, y: y + h },
		fillet(x, y + h, -1, 0, 0, -1, radius),
		{ op: 'L', x, y: y + radius },
		fillet(x, y, 0, -1, 1, 0, radius),
		{ op: 'Z' }
	];
}

/**
 * Flag (Fähnchen) outline: a rounded body with a narrower tail extending to
 * the right, ending in a rounded stadium cap. The tail is centered on
 * `tailCenterY` — the bottom half's own center, not the fold line — since the
 * tail structurally belongs to the half that doesn't carry the Data Matrix.
 * Every corner — including the two notches where the tail meets the body —
 * uses the same corner radius, so the same cutting tool works everywhere.
 */
export function flagCutPath(
	x: number,
	y: number,
	bodyW: number,
	h: number,
	tailLen: number,
	tailHalfHeight: number,
	cornerRadius: number,
	tailCenterY: number
): PathCommand[] {
	const tailBottom = tailCenterY - tailHalfHeight;
	const tailTop = tailCenterY + tailHalfHeight;
	const tailTipX = x + bodyW + tailLen;
	const tailR = tailHalfHeight;
	const bodyRight = x + bodyW;
	// The straight run between the body corner's fillet and the notch's fillet
	// (on both the bottom and top side) must have non-negative length, or the
	// path folds back on itself. Both fillets eat into that same run — one
	// radius' worth each — so the available clearance must be halved.
	const r = Math.min(
		cornerRadius,
		bodyW / 2,
		h / 2,
		tailHalfHeight,
		(tailBottom - y) / 2,
		(y + h - tailTop) / 2
	);

	return [
		{ op: 'M', x: x + r, y },
		{ op: 'L', x: bodyRight - r, y },
		fillet(bodyRight, y, 1, 0, 0, 1, r),
		{ op: 'L', x: bodyRight, y: tailBottom - r },
		fillet(bodyRight, tailBottom, 0, 1, 1, 0, r),
		{ op: 'L', x: tailTipX - tailR, y: tailBottom },
		quarterArc(tailTipX - tailR, tailCenterY, tailR, 270, 360),
		quarterArc(tailTipX - tailR, tailCenterY, tailR, 0, 90),
		{ op: 'L', x: bodyRight + r, y: tailTop },
		fillet(bodyRight, tailTop, -1, 0, 0, 1, r),
		{ op: 'L', x: bodyRight, y: y + h - r },
		fillet(bodyRight, y + h, 0, 1, -1, 0, r),
		{ op: 'L', x: x + r, y: y + h },
		fillet(x, y + h, -1, 0, 0, -1, r),
		{ op: 'L', x, y: y + r },
		fillet(x, y, 0, -1, 1, 0, r),
		{ op: 'Z' }
	];
}

/**
 * Metrics of the embedded face (Inter Regular, see `./fonts/`), as fractions
 * of its em. Read off the font file's OS/2 table and glyph outlines, so if
 * the face ever changes these move with it. They size type to a measured cap
 * height and centre mixed-case type by its ink rather than by its baseline.
 */
export const FONT_CAP_HEIGHT_RATIO = 0.7275;
/** Depth a descender (p, g, y) actually reaches — the ink, not the font's typographic descent. */
export const FONT_DESCENT_RATIO = 0.21;

/**
 * The square sticker's proportions, measured off the print shop's reference
 * sheet (15 × 15 mm) and expressed as fractions of the sticker's own width or
 * height so they hold at any size. The sticker is a coloured field with a
 * white footer band carrying the org name, and a white rounded panel holding
 * the Data Matrix with the asset number set vertically beside it.
 */
export const SQUARE_STICKER = {
	/** White footer band, as a fraction of sticker height — 3mm of 15mm. */
	bandHeightRatio: 0.2,
	/** Cut-contour corner radius, as a fraction of height — 1.35mm of 15mm. */
	cornerRadiusRatio: 0.09,
	/** Panel inset from the left and right cut edges, as a fraction of width — 1.7mm of 15mm. */
	panelInsetXRatio: 0.113,
	/** Panel inset from the top cut edge and from the band, as a fraction of height — 1mm of 15mm. */
	panelInsetYRatio: 0.067,
	/** The panel's own corner radius, as a fraction of height — 0.7mm of 15mm. */
	panelCornerRatio: 0.047,
	/** Cap height of the org name in the band, as a fraction of height — 1.5mm of 15mm. */
	bandCapHeightRatio: 0.1
} as const;
