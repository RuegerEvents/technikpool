import {
	PDFArray,
	PDFDict,
	PDFName,
	PDFNumber,
	PDFOperator,
	PDFOperatorNames,
	type PDFContext,
	type PDFPage,
	type PDFRef
} from 'pdf-lib';
import type { PathCommand } from './geometry';

const RESOURCE_NAME = 'CS_kiss_cut';

/**
 * Registers the "kiss_cut" spot color (Separation, 100% Magenta tint 1.0)
 * once per document — the print shop's spec requires the cut-contour line
 * to use a solid spot color named exactly "kiss_cut".
 */
export function registerKissCutColorSpace(context: PDFContext): PDFRef {
	const tintTransform = context.obj({
		FunctionType: 2,
		Domain: [0, 1],
		C0: [0, 0, 0, 0],
		C1: [0, 1, 0, 0],
		N: 1
	});
	const tintTransformRef = context.register(tintTransform);

	const separation = PDFArray.withContext(context);
	separation.push(PDFName.of('Separation'));
	separation.push(PDFName.of('kiss_cut'));
	separation.push(PDFName.of('DeviceCMYK'));
	separation.push(tintTransformRef);

	return context.register(separation);
}

function ensureResourceName(page: PDFPage, kissCutRef: PDFRef): PDFName {
	const context = page.doc.context;
	let resources = page.node.Resources();
	if (!resources) {
		resources = PDFDict.withContext(context);
		page.node.set(PDFName.of('Resources'), resources);
	}
	let colorSpaceDict = resources.lookupMaybe(PDFName.of('ColorSpace'), PDFDict);
	if (!colorSpaceDict) {
		colorSpaceDict = PDFDict.withContext(context);
		resources.set(PDFName.of('ColorSpace'), colorSpaceDict);
	}
	const name = PDFName.of(RESOURCE_NAME);
	colorSpaceDict.set(name, kissCutRef);
	return name;
}

function pathCommandsToOperators(commands: PathCommand[]): PDFOperator[] {
	return commands.map((cmd) => {
		switch (cmd.op) {
			case 'M':
				return PDFOperator.of(PDFOperatorNames.MoveTo, [PDFNumber.of(cmd.x), PDFNumber.of(cmd.y)]);
			case 'L':
				return PDFOperator.of(PDFOperatorNames.LineTo, [PDFNumber.of(cmd.x), PDFNumber.of(cmd.y)]);
			case 'C':
				return PDFOperator.of(PDFOperatorNames.AppendBezierCurve, [
					PDFNumber.of(cmd.x1),
					PDFNumber.of(cmd.y1),
					PDFNumber.of(cmd.x2),
					PDFNumber.of(cmd.y2),
					PDFNumber.of(cmd.x3),
					PDFNumber.of(cmd.y3)
				]);
			case 'Z':
				return PDFOperator.of(PDFOperatorNames.ClosePath);
		}
	});
}

/** Strokes a path (absolute page coordinates, in points) using the kiss_cut spot color at full tint. */
export function strokeKissCutPath(
	page: PDFPage,
	kissCutRef: PDFRef,
	commands: PathCommand[],
	lineWidthPt: number
): void {
	const csName = ensureResourceName(page, kissCutRef);
	page.pushOperators(
		PDFOperator.of(PDFOperatorNames.PushGraphicsState),
		PDFOperator.of(PDFOperatorNames.StrokingColorspace, [csName]),
		PDFOperator.of(PDFOperatorNames.StrokingColorN, [PDFNumber.of(1)]),
		PDFOperator.of(PDFOperatorNames.SetLineWidth, [PDFNumber.of(lineWidthPt)]),
		...pathCommandsToOperators(commands),
		PDFOperator.of(PDFOperatorNames.StrokePath),
		PDFOperator.of(PDFOperatorNames.PopGraphicsState)
	);
}

/**
 * Fills a path (absolute page coordinates, in points) with a plain RGB color.
 * Uses raw operators rather than pdf-lib's high-level drawSvgPath, which
 * applies its own Y-flip/translate relative to the page's drawing cursor —
 * that assumes SVG-style (Y-down, relative) path data, not the absolute,
 * PDF-native (Y-up) coordinates used throughout this module.
 */
export function fillPathRgb(
	page: PDFPage,
	commands: PathCommand[],
	r: number,
	g: number,
	b: number
): void {
	page.pushOperators(
		PDFOperator.of(PDFOperatorNames.PushGraphicsState),
		PDFOperator.of(PDFOperatorNames.NonStrokingColorRgb, [
			PDFNumber.of(r),
			PDFNumber.of(g),
			PDFNumber.of(b)
		]),
		...pathCommandsToOperators(commands),
		PDFOperator.of(PDFOperatorNames.FillNonZero),
		PDFOperator.of(PDFOperatorNames.PopGraphicsState)
	);
}
