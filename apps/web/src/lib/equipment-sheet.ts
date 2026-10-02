// Shared between the server that renders the delivery note and packing list
// and the page that waits for them.

export type SheetKind = 'delivery-note' | 'packing-list';

/**
 * How far along a sheet is. The pictures are what takes the time: a kit
 * preview may have to be regenerated first, then every photo is fetched and
 * shrunk.
 */
export type SheetProgress = {
	stage: 'previews' | 'images' | 'layout';
	done: number;
	total: number;
};

export type SheetStep =
	| { type: 'progress'; progress: SheetProgress }
	| { type: 'done'; pdf: Uint8Array; filename: string };

/**
 * Where each stage sits on the bar. Redrawing previews is reported only when
 * there is any — mostly there is none, and then the pictures get its share.
 */
const STAGE_SPAN: Record<
	'withPreviews' | 'imagesOnly',
	Record<SheetProgress['stage'], [number, number]>
> = {
	withPreviews: { previews: [0, 0.4], images: [0.4, 0.92], layout: [0.92, 1] },
	imagesOnly: { previews: [0, 0], images: [0, 0.92], layout: [0.92, 1] }
};

/** The whole job as a fraction, 0–1. `withPreviews`: a previews stage was reported. */
export function sheetFraction({ stage, done, total }: SheetProgress, withPreviews: boolean) {
	const [from, to] = STAGE_SPAN[withPreviews ? 'withPreviews' : 'imagesOnly'][stage];
	return from + (to - from) * (total > 0 ? done / total : 0);
}
