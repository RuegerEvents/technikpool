import { toast } from 'svelte-sonner';
import { streamEquipmentSheet } from '#lib/remote/equipment-sheets.remote.js';
import { getErrorMessage } from '#lib/utils.js';
import { sheetFraction, type SheetKind, type SheetProgress } from '#lib/equipment-sheet.js';

export function sheetTitle(kind: SheetKind) {
	return kind === 'delivery-note' ? 'Delivery note' : 'Packing list';
}

export function stageLabel(stage: SheetProgress['stage']) {
	switch (stage) {
		case 'previews':
			return 'Updating previews';
		case 'images':
			return 'Loading pictures';
		case 'layout':
			return 'Laying out pages';
	}
}

/**
 * The new tab while it waits: the click opened it, so the progress is drawn
 * there rather than on the page the user has just left. Built with DOM calls
 * into the blank document, which belongs to this origin until the PDF
 * replaces it.
 */
function waitingTab(tab: Window, title: string) {
	const doc = tab.document;
	doc.title = title;
	const style = doc.createElement('style');
	style.textContent = `
		:root { color-scheme: light dark; --fg: #171717; --muted: #737373; --track: #e5e5e5; --bar: #171717; }
		@media (prefers-color-scheme: dark) {
			:root { --fg: #fafafa; --muted: #a3a3a3; --track: #262626; --bar: #fafafa; }
		}
		body { margin: 0; min-height: 100vh; display: grid; place-items: center;
			font: 14px/1.4 system-ui, sans-serif; color: var(--fg); }
		main { width: min(320px, calc(100vw - 32px)); }
		h1 { margin: 0 0 12px; font-size: 16px; font-weight: 600; display: flex; justify-content: space-between; }
		.percent { color: var(--muted); font-weight: 400; font-variant-numeric: tabular-nums; }
		.track { height: 6px; border-radius: 999px; background: var(--track); overflow: hidden; }
		.bar { height: 100%; width: 0; border-radius: 999px; background: var(--bar); transition: width .2s; }
		p { margin: 8px 0 0; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
	`;
	doc.head.append(style);
	const main = doc.createElement('main');
	const heading = doc.createElement('h1');
	const percent = doc.createElement('span');
	percent.className = 'percent';
	heading.append(title, percent);
	const track = doc.createElement('div');
	track.className = 'track';
	const bar = doc.createElement('div');
	bar.className = 'bar';
	track.append(bar);
	const label = doc.createElement('p');
	label.textContent = 'Gathering the equipment';
	main.append(heading, track, label);
	doc.body.replaceChildren(main);

	return (progress: SheetProgress, fraction: number) => {
		const value = Math.round(fraction * 100);
		percent.textContent = `${value} %`;
		bar.style.width = `${value}%`;
		label.textContent =
			progress.stage === 'layout'
				? stageLabel(progress.stage)
				: `${stageLabel(progress.stage)} ${progress.done} / ${progress.total}`;
	};
}

/**
 * Builds a delivery note or packing list and opens it in a new tab.
 *
 * The tab is opened on the click and filled once the PDF is there: a tab
 * opened after waiting is no longer the click's doing, and browsers block it
 * as a popup. It shows the progress meanwhile. Should the browser refuse even
 * that tab, `progress` drives the card on the page instead, and the PDF is
 * offered in a toast at the end.
 */
export class SheetDownload {
	kind = $state<SheetKind | null>(null);
	progress = $state<SheetProgress | null>(null);
	/** The whole job, 0–1. */
	fraction = $state(0);

	get busy() {
		return this.kind !== null;
	}

	async open(kind: SheetKind, productionId: string, org: string | null) {
		if (this.kind) return;
		const title = sheetTitle(kind);
		const tab = window.open('', '_blank');
		const showInTab = tab ? waitingTab(tab, title) : null;
		this.kind = kind;
		this.progress = null;
		this.fraction = 0;
		let withPreviews = false;
		try {
			const steps = streamEquipmentSheet({
				kind,
				productionId,
				org,
				request: crypto.randomUUID()
			});
			for await (const step of steps) {
				if (step.type === 'progress') {
					withPreviews ||= step.progress.stage === 'previews';
					this.progress = step.progress;
					this.fraction = sheetFraction(step.progress, withPreviews);
					if (tab && !tab.closed) showInTab?.(step.progress, this.fraction);
					continue;
				}
				const url = URL.createObjectURL(
					new Blob([step.pdf as BlobPart], { type: 'application/pdf' })
				);
				if (tab && !tab.closed) {
					tab.location.href = url;
					// Long enough for the tab to have loaded it.
					setTimeout(() => URL.revokeObjectURL(url), 60_000);
				} else {
					toast.success(title, {
						action: { label: 'Open', onClick: () => window.open(url, '_blank') },
						duration: 30_000
					});
					setTimeout(() => URL.revokeObjectURL(url), 600_000);
				}
				break;
			}
		} catch (err) {
			tab?.close();
			toast.error(getErrorMessage(err));
		} finally {
			this.kind = null;
			this.progress = null;
		}
	}
}
