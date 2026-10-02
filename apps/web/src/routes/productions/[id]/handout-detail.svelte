<script lang="ts">
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import StocktakeProgress from '$lib/components/stocktake-progress.svelte';
	import { ScanBar, TickList, type ScanFeedback } from '$lib/components/production-list';
	import { listSections, type ListLine } from '$lib/production-list';
	import { makerAndName } from '$lib/product-label';
	import { getErrorMessage, plural } from '$lib/utils';
	import {
		getProductionHandout,
		scanProductionHandout,
		setProductionHandoutDone,
		setProductionHandoutLine
	} from '$lib/remote/production-handout.remote';

	// Handing a production's equipment out, or taking it back, against its
	// list: the same list as a check, but a tick is the booking itself. Scan a
	// tag, tick a unit whose label was checked by eye, or count the cables
	// that have none. See services/production-handout.ts.

	let {
		productionId,
		mode,
		organizationId
	}: {
		productionId: string;
		mode: 'checkout' | 'checkin';
		/** The side the list is seen from, from `?org=`; '' for the default. */
		organizationId: string;
	} = $props();

	let handout = $derived(await getProductionHandout({ productionId, mode, organizationId }));
	/** Carries the side over to the other list. */
	let orgQuery = $derived(organizationId ? `?org=${encodeURIComponent(organizationId)}` : '');
	type Item = (typeof handout.items)[number];
	let enabled = $derived(mode === 'checkin' || !handout.cancelled);

	// Others work through the same list at the same time, on handhelds too.
	$effect(() => {
		const reload = () => {
			if (document.visibilityState === 'visible')
				getProductionHandout({ productionId, mode, organizationId }).refresh();
		};
		const timer = setInterval(reload, 10_000);
		document.addEventListener('visibilitychange', reload);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', reload);
		};
	});

	let remaining = $derived(handout.items.filter((i) => !i.done));
	let progress = $derived({
		expected: handout.items.length,
		found: handout.items.length - remaining.length,
		out: 0,
		unexpected: 0
	});
	let sections = $derived(listSections(handout.items, handout.lines));

	function unitState(item: Item) {
		let note: { text: string; tone: 'muted' | 'warn' } | null = null;
		// On the take-back list: booked, but nobody handed it out. A tick books both.
		if (mode === 'checkin' && item.status === 'APPROVED')
			note = { text: 'Not out yet', tone: 'muted' };
		else if (item.lentBy && item.returnReported) note = { text: 'Return reported', tone: 'muted' };
		else if (item.lentBy && item.status === 'CHECKED_OUT' && !item.received)
			note = { text: 'Receipt open', tone: 'warn' };
		return { done: item.done, locked: false, note };
	}

	let busy = $state(false);

	async function apply(assetIds: string[], done: boolean) {
		if (assetIds.length === 0) return;
		busy = true;
		try {
			await setProductionHandoutDone({ productionId, mode, organizationId, assetIds, done });
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}

	async function count(line: ListLine, n: number) {
		busy = true;
		try {
			await setProductionHandoutLine({
				productionId,
				mode,
				organizationId,
				key: line.key,
				count: n
			});
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}

	function tickSection(units: Item[], lines: ListLine[]) {
		const counted = new Set(lines.flatMap((l) => l.assetIds));
		return apply(
			[
				...units.map((u) => u.assetId),
				...handout.items.filter((i) => counted.has(i.assetId) && !i.done).map((i) => i.assetId)
			],
			true
		);
	}

	async function submitCode(value: string): Promise<ScanFeedback> {
		const result = await scanProductionHandout({ productionId, mode, organizationId, code: value });
		const name = makerAndName(result.asset.manufacturerName, result.asset.productName);
		const rest = (result.group?.units ?? []).filter((u) => !u.done);
		// Taking back puts any unit on its shelf, but only one that came from this
		// production is a return; anything else is said so.
		const foreign =
			result.action !== 'CHECKED_OUT' && !result.returnedFrom.includes(handout.productionName);
		const feedback: ScanFeedback = {
			tone: foreign ? 'warn' : 'good',
			title:
				result.action === 'CHECKED_OUT'
					? `Checked out: ${name}`
					: foreign
						? `Not on this production: ${name}`
						: `Returned: ${name}`,
			detail: [
				result.asset.assetTag,
				result.returnedFrom.length > 0 ? `From ${result.returnedFrom.join(', ')}` : null,
				foreign ? `Put back on ${result.targetName}` : null
			]
				.filter(Boolean)
				.join(' · ')
		};
		// A unit taken out of its kit, or off the unit it hangs off, went on its
		// own; the rest is offered, so a scan never waits on a tap.
		if (rest.length > 0 && result.group) {
			feedback.tone = 'warn';
			feedback.action = {
				label: plural(rest.length, [
					`Also the rest of ${result.group.name} (1)`,
					`Also the rest of ${result.group.name} (#)`
				]),
				run: () =>
					setProductionHandoutDone({
						productionId,
						mode,
						organizationId,
						assetIds: rest.map((u) => u.id),
						done: true
					}).then(() => undefined)
			};
		}
		return feedback;
	}
</script>

<svelte:head
	><title
		>{mode === 'checkout' ? 'Hand out' : 'Take back'}
		{handout.productionName} | Technikpool</title
	></svelte:head
>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">
				{#if mode === 'checkout'}
					Hand out: {handout.productionName}
				{:else}
					Take back: {handout.productionName}
				{/if}
			</h1>
			<p class="text-muted-foreground">
				{#if mode === 'checkout'}
					A tick checks the unit out to the production at once; taking it off puts the unit back to
					booked.
				{:else}
					A tick returns the unit to the shelf it is kept on at once; taking it off checks it out
					again.
				{/if}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if mode === 'checkout'}
				<Button
					variant="outline"
					href={`${resolve(`/productions/${productionId}/checkin`)}${orgQuery}`}>Take back</Button
				>
			{:else}
				<Button
					variant="outline"
					href={`${resolve(`/productions/${productionId}/checkout`)}${orgQuery}`}>Hand out</Button
				>
			{/if}
			<Button variant="outline" href={resolve(`/productions/${productionId}`)}
				>Back to the production</Button
			>
		</div>
	</div>

	{#if handout.sides.length > 1}
		<!-- Someone in more than one org on this production picks whose units they
		     work through: everything, or only what one lending org has to pack. -->
		<div class="flex w-fit flex-wrap gap-1 rounded-md border p-1 text-sm">
			{#each handout.sides as s (s.organizationId)}
				<!-- resolve() takes a path only; the query is the side. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={`${resolve(`/productions/${productionId}/${mode}`)}?org=${encodeURIComponent(s.organizationId)}`}
					class="rounded px-3 py-1 transition-colors {s.organizationId ===
					handout.side.organizationId
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:bg-muted'}"
				>
					{s.own ? 'Everything on the production' : `Units of ${s.organizationName}`}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}
		</div>
	{/if}

	{#if !enabled}
		<Card.Root>
			<Card.Content class="text-sm text-muted-foreground">
				This production has been cancelled. Nothing more goes out to it.
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content>
				<ScanBar
					id="handout-code"
					label={mode === 'checkout' ? 'Scan what goes out' : 'Scan what comes back'}
					buttonLabel="Book"
					submit={submitCode}
				/>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Content class="space-y-4">
			<StocktakeProgress {progress} />

			{#if handout.items.length === 0}
				<p class="text-sm text-muted-foreground">
					{#if mode === 'checkout'}
						Nothing is booked for this production that you could hand out.
					{:else}
						Nothing of yours is booked for this production.
					{/if}
				</p>
			{:else}
				<TickList
					{sections}
					{unitState}
					{enabled}
					{busy}
					doneLabel={mode === 'checkout' ? 'Out' : 'Back'}
					tickSectionLabel="Tick section"
					ontoggle={(item) => apply([item.assetId], !item.done)}
					oncount={count}
					ontickSection={tickSection}
				/>
			{/if}

			{#if handout.othersCount > 0}
				<p class="text-sm text-muted-foreground">
					<!-- On a lender's side the rest may well be this user's to book too —
					     just not on this list. -->
					{#if handout.side.own}
						{plural(handout.othersCount, [
							'1 more unit belongs to another organization, which books it itself.',
							'# more units belong to other organizations, which book them themselves.'
						])}
					{:else}
						{plural(handout.othersCount, [
							'1 more unit on the production is not on this list.',
							'# more units on the production are not on this list.'
						])}
					{/if}
				</p>
			{/if}

			{#if enabled && handout.items.length > 0}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-sm text-muted-foreground">
						{#if remaining.length === 0}
							{mode === 'checkout' ? 'Everything is out.' : 'Everything is back.'}
						{:else}
							{remaining.length} still open.
						{/if}
					</p>
					{#if remaining.length > 0}
						<Button
							variant="outline"
							disabled={busy}
							onclick={() =>
								apply(
									remaining.map((i) => i.assetId),
									true
								)}>Tick all</Button
						>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
