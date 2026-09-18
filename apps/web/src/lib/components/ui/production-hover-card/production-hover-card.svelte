<script lang="ts">
	import { page } from '$app/state';
	import { dayCountBetween, plural } from '$lib/utils';
	import type { ProductionHoverInfo } from './types';

	type Props = {
		info: ProductionHoverInfo | null;
		/** Cursor x and the hovered bar's box, both in viewport coordinates. */
		anchor: { x: number; rect: DOMRect } | null;
	};

	let { info, anchor }: Props = $props();

	const GAP = 6;
	const MARGIN = 8;

	let cardWidth = $state(0);
	let cardHeight = $state(0);

	// One card for the whole calendar, placed at the hovered bar rather than
	// mounted per bar: a timeline holds hundreds of bars, and a production's
	// setup and show segments are separate elements that should share it.
	// Follows the cursor along the bar, since a bar can span weeks, and flips
	// above it when there is no room below.
	let position = $derived.by(() => {
		if (!anchor) return { left: 0, top: 0 };
		const below = anchor.rect.bottom + GAP;
		const top =
			below + cardHeight + MARGIN <= window.innerHeight
				? below
				: Math.max(MARGIN, anchor.rect.top - GAP - cardHeight);
		const left = Math.max(MARGIN, Math.min(anchor.x - 12, window.innerWidth - cardWidth - MARGIN));
		return { left, top };
	});

	let dateFormat = $derived(
		new Intl.DateTimeFormat(page.data.locale === 'en' ? 'en-GB' : 'de-DE', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		})
	);

	function formatRange(start: Date | string, end: Date | string) {
		return dateFormat.formatRange(new Date(start), new Date(end));
	}

	function days(start: Date | string, end: Date | string) {
		return dayCountBetween(start, end) ?? 1;
	}

	let showWindow = $derived.by(() => {
		if (!info || (!info.showStartDate && !info.showEndDate)) return null;
		return {
			start: info.showStartDate ?? info.startDate,
			end: info.showEndDate ?? info.endDate
		};
	});
</script>

{#if info && anchor}
	<div
		role="tooltip"
		bind:clientWidth={cardWidth}
		bind:clientHeight={cardHeight}
		class="pointer-events-none fixed z-50 w-max max-w-[calc(100vw-1rem)] overflow-hidden rounded-md border bg-popover p-3 whitespace-nowrap text-popover-foreground shadow-md"
		style="left: {position.left}px; top: {position.top}px"
	>
		<div class="flex items-start gap-2">
			<span class="mt-1.5 size-2 shrink-0 rounded-full" style="background-color: {info.color}"
			></span>
			<p class="text-sm leading-snug font-semibold">{info.name}</p>
		</div>
		{#if info.organization}
			<p class="mt-0.5 pl-4 text-xs text-muted-foreground">{info.organization}</p>
		{/if}
		{#if info.pending}
			<p class="mt-1.5 pl-4 text-xs font-medium">Pending approval</p>
		{/if}
		<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pl-4 text-xs">
			<dt class="text-muted-foreground">Duration</dt>
			<dd>
				{formatRange(info.startDate, info.endDate)}
				<span class="text-muted-foreground"
					>· {plural(days(info.startDate, info.endDate), ['# day', '# days'])}</span
				>
			</dd>
			{#if showWindow}
				<dt class="text-muted-foreground">Show days</dt>
				<dd>
					{formatRange(showWindow.start, showWindow.end)}
					<span class="text-muted-foreground"
						>· {plural(days(showWindow.start, showWindow.end), ['# day', '# days'])}</span
					>
				</dd>
			{/if}
			{#if info.customer}
				<dt class="text-muted-foreground">Customer</dt>
				<dd>{info.customer}</dd>
			{/if}
			{#if info.venue}
				<dt class="text-muted-foreground">Venue</dt>
				<dd>
					{#if info.venue.name}<div>{info.venue.name}</div>{/if}
					{#if info.venue.street}<div>{info.venue.street}</div>{/if}
					{#if info.venue.city}<div>{info.venue.city}</div>{/if}
				</dd>
			{/if}
			{#if info.itemCount !== null}
				<dt class="text-muted-foreground">Equipment</dt>
				<dd>{plural(info.itemCount, ['# item', '# items'])}</dd>
			{/if}
			{#if info.crewCount !== null}
				<dt class="text-muted-foreground">Crew</dt>
				<dd>{plural(info.crewCount, ['# person', '# people'])}</dd>
			{/if}
			{#if info.booked}
				<dt class="text-muted-foreground">Booked</dt>
				<dd>{info.booked.count} of {info.booked.total}</dd>
			{/if}
		</dl>
	</div>
{/if}
