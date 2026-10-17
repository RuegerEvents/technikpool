import { query } from '$app/server';
import * as v from 'valibot';
import {
	renderEquipmentSheet,
	renderOrgEquipmentList
} from '#lib/server/services/equipment-sheet.js';
import type { SheetProgress, SheetStep } from '#lib/equipment-sheet.js';

/**
 * Runs a renderer and yields its progress, then the PDF itself, and ends.
 *
 * The renderer reports through a callback; the stream hands on the latest
 * report whenever it gets round to it. Skipped ones are no loss — only the
 * newest position of a bar matters.
 */
async function* withProgress(
	render: (
		report: (progress: SheetProgress) => void
	) => Promise<{ bytes: Uint8Array; filename: string }>
): AsyncGenerator<SheetStep> {
	let latest: SheetProgress | null = null;
	let finished = false;
	let wake: (() => void) | null = null;
	const job = render((progress) => {
		latest = progress;
		wake?.();
	}).finally(() => {
		finished = true;
		wake?.();
	});
	// Awaited below; this only keeps a failure from counting as unhandled
	// while the loop is still waiting for the next report.
	job.catch(() => {});

	while (!finished) {
		if (latest) {
			const progress: SheetProgress = latest;
			latest = null;
			yield { type: 'progress', progress };
			continue;
		}
		await new Promise<void>((resolve) => (wake = resolve));
		wake = null;
	}
	const { bytes, filename } = await job;
	yield { type: 'done', pdf: bytes, filename };
}

/**
 * The delivery note or packing list as a PDF, with progress on the way: a sheet
 * full of pictures takes a while, and a tab that stays blank that long looks
 * broken. Yields progress, then the PDF itself, and ends.
 *
 * `request` is any value unique to the click. A live query is cached by its
 * argument, so without it a second click would be answered with the first
 * click's PDF instead of what is booked now.
 */
export const streamEquipmentSheet = query.live(
	v.object({
		kind: v.picklist(['delivery-note', 'packing-list']),
		productionId: v.string(),
		org: v.nullable(v.string()),
		request: v.string()
	}),
	({ kind, productionId, org }) =>
		withProgress((report) => renderEquipmentSheet(kind, productionId, org, report))
);

/**
 * An org's equipment list as a PDF, with progress the same way: a catalogue
 * is a picture per product. `request` as above.
 */
export const streamOrgEquipmentList = query.live(
	v.object({
		organizationId: v.string(),
		layout: v.picklist(['catalogue', 'inventory']),
		prices: v.boolean(),
		request: v.string()
	}),
	({ organizationId, layout, prices }) =>
		withProgress((report) => renderOrgEquipmentList(organizationId, { layout, prices }, report))
);
