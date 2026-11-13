<script lang="ts">
	import { EQUIPMENT_VIEWS } from '#lib/equipment-views.js';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import StocktakeProgress from '#lib/components/stocktake-progress.svelte';
	import {
		ScanBar,
		TickList,
		UnitQuestion,
		type ScanFeedback
	} from '#lib/components/production-list/index.js';
	import HandoutSearch from './handout-search.svelte';
	import { listSections, type ListLine } from '#lib/production-list.js';
	import { makerAndName } from '#lib/product-label.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import { confirmAction } from '#lib/confirm.svelte.js';
	import {
		getProductionHandout,
		packProductionCase,
		scanProductionHandout,
		setProductionHandoutDone,
		setProductionHandoutLine
	} from '#lib/remote/production-handout.remote.js';
	import { reportDefect } from '#lib/remote/inspections.remote.js';
	import { inspectionTypeLabel } from '#lib/inspection-ui.svelte.js';
	import { kitSwapNoticeText, swapNoticeText } from '#lib/swap-notice.svelte.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { SvelteSet } from 'svelte/reactivity';
	import { tick } from 'svelte';
	import { Box, PackageMinus, PackagePlus, TriangleAlert } from '@lucide/svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import {
		caseNumber,
		caseTitle,
		withinCase,
		type ListCase,
		type ListCaseRef
	} from '#lib/pack-cases.js';
	import type { ListKit } from '#lib/production-list.js';

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

	// On the hand-out list, a unit already taken back is there to be sent out
	// again if that was a mistake — not something still to do.
	function takenBack(item: Item) {
		return mode === 'checkout' && item.status === 'RETURNED';
	}
	function open(item: Item) {
		return !item.done && !takenBack(item);
	}
	let expected = $derived(handout.items.filter((i) => !takenBack(i)));
	let remaining = $derived(handout.items.filter(open));
	let progress = $derived({
		expected: expected.length,
		found: expected.length - remaining.length,
		out: 0,
		unexpected: 0
	});
	let sections = $derived(listSections(handout.items, handout.lines));

	// Packing (Ausgabe only): a case is opened by scanning it or with its
	// heading's button, and what is scanned next goes into it until it is
	// closed or another case is opened. The open case is this page's, not the
	// production's — two people pack two cases at once. See "Pack cases".
	let openCaseId = $state<string | null>(null);
	/** The open case as the list has it now; gone when it left the list. */
	let openCase = $derived.by(() => {
		if (mode !== 'checkout' || !openCaseId) return null;
		const own = handout.items.find((i) => i.isPackCase && i.assetId === openCaseId);
		return own?.packCase ?? null;
	});

	/** The case an item is packed in — for a case, the one around it. */
	function directCaseOf(item: Item): ListCaseRef | null {
		if (!item.packCase) return null;
		return item.isPackCase ? (item.packCase.path.at(-1) ?? null) : item.packCase;
	}

	async function pack(
		caseAssetId: string | null,
		selection: { assetIds?: string[]; line?: { key: string; count: number } }
	) {
		busy = true;
		try {
			const { count } = await packProductionCase({
				productionId,
				organizationId,
				caseAssetId,
				...selection
			}).updates(...EQUIPMENT_VIEWS);
			return count;
		} catch (err) {
			toast.error(getErrorMessage(err));
			return 0;
		} finally {
			busy = false;
		}
	}

	// Part of a counted line into the open case: how many is asked.
	let lineTarget = $state<ListLine | null>(null);
	let lineDialogOpen = $state(false);
	let lineCount = $state(1);

	function openLineDialog(line: ListLine) {
		lineTarget = line;
		lineCount = line.total;
		lineDialogOpen = true;
	}

	async function submitLine(e: Event) {
		e.preventDefault();
		if (!lineTarget || !openCase) return;
		const n = Math.max(1, Math.min(lineTarget.total, Math.round(lineCount)));
		await pack(openCase.assetId, { line: { key: lineTarget.key, count: n } });
		lineDialogOpen = false;
	}

	// A case scanned while another one is open: into it, or opened instead?
	let caseChoice = $state<{ scanned: ListCaseRef; open: ListCase } | null>(null);
	let caseChoiceOpen = $state(false);
	let answerChoice: ((into: boolean) => void) | null = null;

	function askCaseChoice(scanned: ListCaseRef, open: ListCase) {
		answerChoice?.(false);
		caseChoice = { scanned, open };
		caseChoiceOpen = true;
		return new Promise<boolean>((resolve) => (answerChoice = resolve));
	}

	function chooseCase(into: boolean) {
		caseChoiceOpen = false;
		answerChoice?.(into);
		answerChoice = null;
	}

	/** A case's sticker on the hand-out list: open it, or put it into the open one. */
	async function caseScanned(scanned: ListCaseRef): Promise<ScanFeedback> {
		const title = caseTitle(scanned);
		const open = openCase;
		if (open && open.assetId !== scanned.assetId && (await askCaseChoice(scanned, open))) {
			const moved = await pack(open.assetId, { assetIds: [scanned.assetId] });
			return moved > 0
				? {
						tone: 'good',
						title: `Case ${title} is in case ${caseNumber(open)}`,
						detail: `Case ${caseNumber(open)} stays open`
					}
				: { tone: 'bad', title: `Case ${title} could not go into case ${caseNumber(open)}` };
		}
		openCaseId = scanned.assetId;
		return {
			tone: 'good',
			title: `Case ${title} is open`,
			detail: 'What you scan now goes into it.'
		};
	}

	/**
	 * A case's sticker on the take-back list: the case is back, and what is
	 * still in it — inner cases' contents too — is asked about. What is left
	 * ticked comes back; the rest stays out.
	 */
	async function caseReturned(scanned: ListCaseRef): Promise<ScanFeedback> {
		await tick();
		const title = caseTitle(scanned);
		const inside = (c: ListCase | null | undefined) => withinCase(c, scanned.assetId);
		const counted = new Set(handout.lines.flatMap((l) => l.assetIds));
		const units = handout.items.filter(
			(i) =>
				i.assetId !== scanned.assetId &&
				!i.done &&
				!i.accessoryOf &&
				!counted.has(i.assetId) &&
				inside(i.packCase)
		);
		const lines = handout.lines.filter((l) => inside(l.packCase) && l.done < l.total);
		if (units.length === 0 && lines.length === 0) {
			return { tone: 'good', title: `Returned: case ${title}`, detail: 'Nothing else is in it.' };
		}
		const there = await question?.ask(
			`Case ${title}`,
			'The case is back. Is all of this back in it? Untick what is missing; it stays out.',
			[
				...units.map((u) => ({
					id: u.assetId,
					name: makerAndName(u.manufacturerName, u.productName),
					tag: u.assetTag
				})),
				...lines.map((l) => ({
					id: `line:${l.key}`,
					name: `${l.total - l.done}× ${makerAndName(l.manufacturerName, l.productName)}`,
					tag: null
				}))
			]
		);
		if (!there) {
			return {
				tone: 'warn',
				title: `Returned: case ${title}`,
				detail: 'What is in it is still out.'
			};
		}
		const back = units.filter((u) => there.has(u.assetId)).map((u) => u.assetId);
		if (back.length > 0) await apply(back, true);
		for (const line of lines) {
			if (there.has(`line:${line.key}`)) await count(line, line.total);
		}
		const missing = units.length + lines.length - there.size;
		return {
			tone: missing > 0 ? 'warn' : 'good',
			title: `Returned: case ${title}`,
			detail:
				missing > 0
					? plural(missing, ['1 entry stays out', '# entries stay out'])
					: 'Everything in it is back.'
		};
	}

	// Taking a unit back is when someone looks at it: whoever books it back and
	// reports nothing found it fine (a passed visual check, where its product
	// needs one). A defect is reported here instead.
	let defectTarget = $state<Item | null>(null);
	let defectOpen = $state(false);
	let defectNotes = $state('');
	let reportingDefect = $state(false);
	const defectsReported = new SvelteSet<string>();

	function openDefect(item: Item) {
		defectTarget = item;
		defectNotes = '';
		defectOpen = true;
	}

	async function submitDefect(e: Event) {
		e.preventDefault();
		if (!defectTarget) return;
		reportingDefect = true;
		try {
			await reportDefect({ assetId: defectTarget.assetId, notes: defectNotes }).updates(
				...EQUIPMENT_VIEWS
			);
			defectsReported.add(defectTarget.assetId);
			toast.success('Defect reported · the unit is in maintenance');
			defectOpen = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			reportingDefect = false;
		}
	}

	function unitState(item: Item) {
		let note: { text: string; tone: 'muted' | 'warn' } | null = null;
		if (defectsReported.has(item.assetId)) {
			return {
				done: item.done,
				locked: false,
				note: { text: 'Defect reported', tone: 'warn' as const }
			};
		}
		// On the take-back list: booked, but nobody handed it out. A tick books both.
		if (mode === 'checkin' && item.status === 'APPROVED')
			note = { text: 'Not out yet', tone: 'muted' };
		else if (takenBack(item)) note = { text: 'Taken back · tick to hand out again', tone: 'muted' };
		else if (item.kitAddition) note = { text: 'New in the kit, not booked yet', tone: 'warn' };
		else if (mode === 'checkout' && item.inspectionOverdue && !item.done)
			note = { text: 'Inspection overdue', tone: 'warn' };
		else if (item.lentBy && item.returnReported) note = { text: 'Return reported', tone: 'muted' };
		else if (item.lentBy && item.status === 'CHECKED_OUT' && !item.received)
			note = { text: 'Receipt open', tone: 'warn' };
		return { done: item.done, locked: false, note, optional: takenBack(item) };
	}

	let busy = $state(false);

	async function apply(assetIds: string[], done: boolean) {
		if (assetIds.length === 0) return;
		try {
			await setProductionHandoutDone({
				productionId,
				mode,
				organizationId,
				assetIds,
				done
			}).updates(...EQUIPMENT_VIEWS);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function count(line: ListLine, n: number) {
		try {
			await setProductionHandoutLine({
				productionId,
				mode,
				organizationId,
				key: line.key,
				count: n
			}).updates(...EQUIPMENT_VIEWS);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	/** Ticking one unit is booked at once; several at a stroke are asked first. */
	function confirmMany(n: number) {
		return confirmAction(
			mode === 'checkout'
				? {
						title: plural(n, ['Hand out 1 unit?', 'Hand out # units?']),
						description: 'They are checked out to the production right away.',
						confirmLabel: 'Hand out'
					}
				: {
						title: plural(n, ['Take back 1 unit?', 'Take back # units?']),
						description: 'They go back onto the shelf they are kept on right away.',
						confirmLabel: 'Take back'
					}
		);
	}

	async function applyMany(assetIds: string[]) {
		if (assetIds.length === 0 || !(await confirmMany(assetIds.length))) return;
		busy = true;
		try {
			await apply(assetIds, true);
		} finally {
			busy = false;
		}
	}

	function tickSection(units: Item[], lines: ListLine[]) {
		const counted = new Set(lines.flatMap((l) => l.assetIds));
		return applyMany([
			...units.filter(open).map((u) => u.assetId),
			...handout.items.filter((i) => counted.has(i.assetId) && open(i)).map((i) => i.assetId)
		]);
	}

	let question = $state<ReturnType<typeof UnitQuestion> | null>(null);

	async function submitCode(value: string): Promise<ScanFeedback> {
		const doneBefore = new Set(handout.items.filter((i) => i.done).map((i) => i.assetId));
		const result = await scanProductionHandout({
			productionId,
			mode,
			organizationId,
			code: value,
			packInto: mode === 'checkout' ? (openCase?.assetId ?? null) : null
		}).updates(...EQUIPMENT_VIEWS);
		if (result.packCase) {
			return mode === 'checkout' ? caseScanned(result.packCase) : caseReturned(result.packCase);
		}
		const overdue = (result.overdueInspections ?? []).map((o) => inspectionTypeLabel(o));
		// Packed into the open case along with the booking.
		const packedNote =
			result.packedInto && openCase?.assetId === result.packedInto
				? `Into case ${caseNumber(openCase)}`
				: null;
		if (result.kit) {
			const scanned = await kitScanned(result.kit, doneBefore);
			// It went out in the place of the kit of its type booked here.
			const kitSwap = result.kitSwap ? kitSwapNoticeText(result.kitSwap) : null;
			const kitFeedback =
				packedNote || kitSwap
					? {
							...scanned,
							detail: [scanned.detail, packedNote, kitSwap].filter(Boolean).join(' · ')
						}
					: scanned;
			if (overdue.length === 0) return kitFeedback;
			return {
				...kitFeedback,
				tone: 'warn',
				detail: [kitFeedback.detail, `Inspection overdue: ${overdue.join(', ')}`]
					.filter(Boolean)
					.join(' · ')
			};
		}
		const name = makerAndName(result.asset.manufacturerName, result.asset.productName);
		// It took the place of a linked unit of the same product, and the two swapped.
		const swap = result.swap ? swapNoticeText(result.swap) : null;
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
				foreign ? `Put back on ${result.targetName}` : null,
				packedNote,
				swap ? `${swap.title} · ${swap.detail}` : null,
				overdue.length > 0 ? `Inspection overdue: ${overdue.join(', ')}` : null
			]
				.filter(Boolean)
				.join(' · ')
		};
		// Out it goes all the same; whoever packs it should know.
		if (overdue.length > 0) feedback.tone = 'warn';
		// A unit taken out of its kit, or off the unit it hangs off, went on its
		// own; the rest is offered, so a scan never waits on a tap.
		if (rest.length > 0 && result.group) {
			feedback.tone = 'warn';
			feedback.action = {
				label: plural(rest.length, [
					`Also the rest of ${result.group.name} (1)`,
					`Also the rest of ${result.group.name} (#)`
				]),
				run: async () => {
					if (!(await confirmMany(rest.length))) return false;
					await setProductionHandoutDone({
						productionId,
						mode,
						organizationId,
						assetIds: rest.map((u) => u.id),
						done: true
					}).updates(...EQUIPMENT_VIEWS);
				}
			};
		}
		return feedback;
	}

	type ScannedKit = NonNullable<Awaited<ReturnType<typeof scanProductionHandout>>['kit']>;

	/**
	 * A kit's sticker booked every unit in it at once; the question that follows
	 * books back what did not go along (or did not come back).
	 */
	async function kitScanned(kit: ScannedKit, doneBefore: Set<string>): Promise<ScanFeedback> {
		const detail = kit.tag ?? undefined;
		if (kit.units.length === 0) {
			return { tone: 'warn', title: `Not on this production: ${kit.name}`, detail };
		}
		if (kit.units.every((u) => doneBefore.has(u.id))) {
			return { tone: 'info', title: `Already ticked: ${kit.name}`, detail };
		}
		const there = await question?.ask(
			`Kit ${kit.name}`,
			mode === 'checkout'
				? 'Does all of it go along? Untick what stays behind.'
				: 'Is all of it back? Untick what is missing.',
			kit.units.map((u) => ({
				id: u.id,
				name: makerAndName(u.manufacturerName, u.productName),
				tag: u.assetTag
			}))
		);
		const missing = there ? kit.units.filter((u) => !there.has(u.id)).map((u) => u.id) : [];
		if (missing.length > 0) await apply(missing, false);
		const booked = kit.units.length - missing.length;
		return {
			tone: missing.length > 0 ? 'warn' : 'good',
			title:
				mode === 'checkout'
					? plural(booked, [
							`Checked out: ${kit.name} (1 unit)`,
							`Checked out: ${kit.name} (# units)`
						])
					: plural(booked, [`Returned: ${kit.name} (1 unit)`, `Returned: ${kit.name} (# units)`]),
			detail: [
				kit.tag,
				missing.length > 0 ? plural(missing.length, ['1 unit left out', '# units left out']) : null
			]
				.filter(Boolean)
				.join(' · ')
		};
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
					href={`${resolve(`productions/${productionId}/checkin`)}${orgQuery}`}>Take back</Button
				>
			{:else}
				<Button
					variant="outline"
					href={`${resolve(`productions/${productionId}/checkout`)}${orgQuery}`}>Hand out</Button
				>
			{/if}
			<Button variant="outline" href={resolve(`productions/${productionId}`)}
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
					href={`${resolve(`productions/${productionId}/${mode}`)}?org=${encodeURIComponent(s.organizationId)}`}
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

	{#if openCase && enabled}
		<!-- The open case stays in view while the list scrolls under it. -->
		<div
			class="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-50 px-4 py-3 dark:bg-emerald-950"
		>
			<div class="flex min-w-0 items-center gap-2">
				<Box aria-hidden="true" class="size-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
				<div class="min-w-0">
					<p class="truncate font-medium">Packing into case {caseTitle(openCase)}</p>
					<p class="text-xs text-muted-foreground">
						What you scan goes into it and out with it. Scan another case to switch.
					</p>
				</div>
			</div>
			<Button variant="outline" size="sm" onclick={() => (openCaseId = null)}>Close case</Button>
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
				{#if mode === 'checkout' && handout.books}
					<HandoutSearch {productionId} {organizationId} />
				{/if}
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
					tickKitLabel="Tick kit"
					ontoggle={(item, done) => apply([item.assetId], done)}
					oncount={count}
					ontickSection={tickSection}
					unitAction={mode === 'checkin' ? defectButton : enabled ? packButtons : undefined}
					lineAction={mode === 'checkout' && enabled ? linePackButtons : undefined}
					kitAction={mode === 'checkout' && enabled ? kitPackButton : undefined}
					caseAction={mode === 'checkout' && enabled ? caseButton : undefined}
					openCaseId={openCase?.assetId ?? null}
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
							onclick={() => applyMany(remaining.map((i) => i.assetId))}>Tick all</Button
						>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<UnitQuestion bind:this={question} />

<Modal bind:open={defectOpen} title="Report a defect" dismissible={!reportingDefect}>
	{#snippet children()}
		<form id="defect-form" class="space-y-3" onsubmit={submitDefect}>
			{#if defectTarget}
				<p class="text-sm text-muted-foreground">
					{defectTarget.productName}{defectTarget.assetTag ? ` · ${defectTarget.assetTag}` : ''}
				</p>
			{/if}
			<div class="space-y-1">
				<Label for="defect-notes">What is wrong?</Label>
				<textarea
					id="defect-notes"
					bind:value={defectNotes}
					required
					maxlength={2000}
					rows={3}
					placeholder="e.g. Cable jacket cut near the plug"
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
				></textarea>
			</div>
			<p class="text-xs text-muted-foreground">
				Recorded as a failed visual check. The unit goes into maintenance until someone has looked
				at it; taking it back still works as usual.
			</p>
		</form>
	{/snippet}
	{#snippet footer()}
		<Button
			icon="save"
			type="submit"
			form="defect-form"
			disabled={reportingDefect || !defectNotes.trim()}
		>
			{reportingDefect ? 'Saving…' : 'Report defect'}
		</Button>
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (defectOpen = false)}
			disabled={reportingDefect}
		>
			Cancel
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={lineDialogOpen} title="Into the case">
	{#snippet children()}
		<form id="pack-line-form" class="space-y-3" onsubmit={submitLine}>
			{#if lineTarget && openCase}
				<p class="text-sm text-muted-foreground">
					How many of {lineTarget.productName} go into case {caseTitle(openCase)}? The rest stays
					where it is.
				</p>
				<div class="space-y-1">
					<Label for="pack-line-count">Number</Label>
					<Input
						id="pack-line-count"
						type="number"
						min={1}
						max={lineTarget.total}
						bind:value={lineCount}
					/>
				</div>
			{/if}
		</form>
	{/snippet}
	{#snippet footer()}
		<Button type="submit" form="pack-line-form" disabled={busy}>Pack</Button>
		<Button type="button" variant="outline" onclick={() => (lineDialogOpen = false)}>Cancel</Button>
	{/snippet}
</Modal>

<Modal bind:open={caseChoiceOpen} title="Another case" onclose={() => chooseCase(false)}>
	{#snippet children()}
		{#if caseChoice}
			<p class="text-sm text-muted-foreground">
				Case {caseTitle(caseChoice.open)} is open. Does case {caseTitle(caseChoice.scanned)} go into it,
				or do you want to pack case {caseNumber(caseChoice.scanned)} now?
			</p>
		{/if}
	{/snippet}
	{#snippet footer()}
		<Button onclick={() => chooseCase(true)}>Put it in</Button>
		<Button variant="outline" onclick={() => chooseCase(false)}>Open it instead</Button>
	{/snippet}
</Modal>

{#snippet packButtons(item: Item)}
	{@const inCase = directCaseOf(item)}
	<!-- Accessories go with the unit they hang off. -->
	{#if !item.accessoryOf}
		<div class="flex">
			{#if openCase && item.assetId !== openCase.assetId && inCase?.assetId !== openCase.assetId}
				<Button
					size="sm"
					variant="ghost"
					title={`Into case ${caseNumber(openCase)}`}
					aria-label={`Into case ${caseNumber(openCase)}`}
					disabled={busy}
					onclick={() => pack(openCase!.assetId, { assetIds: [item.assetId] })}
				>
					<PackagePlus class="size-4" />
				</Button>
			{/if}
			{#if inCase}
				<Button
					size="sm"
					variant="ghost"
					title={`Take out of case ${caseNumber(inCase)}`}
					aria-label={`Take out of case ${caseNumber(inCase)}`}
					disabled={busy}
					onclick={() => pack(null, { assetIds: [item.assetId] })}
				>
					<PackageMinus class="size-4" />
				</Button>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet linePackButtons(line: ListLine)}
	{#if openCase && line.packCase?.assetId !== openCase.assetId}
		<Button
			size="sm"
			variant="ghost"
			title={`Into case ${caseNumber(openCase)}`}
			aria-label={`Into case ${caseNumber(openCase)}`}
			disabled={busy}
			onclick={() => openLineDialog(line)}
		>
			<PackagePlus class="size-4" />
		</Button>
	{/if}
	{#if line.packCase}
		<Button
			size="sm"
			variant="ghost"
			title={`Take out of case ${caseNumber(line.packCase)}`}
			aria-label={`Take out of case ${caseNumber(line.packCase)}`}
			disabled={busy}
			onclick={() => pack(null, { assetIds: line.assetIds })}
		>
			<PackageMinus class="size-4" />
		</Button>
	{/if}
{/snippet}

{#snippet kitPackButton(kit: ListKit, units: Item[])}
	{#if openCase && units.some((u) => u.packCase?.assetId !== openCase.assetId)}
		<Button
			size="sm"
			variant="ghost"
			class="h-7"
			title={`${kit.name} into case ${caseNumber(openCase)}`}
			aria-label={`${kit.name} into case ${caseNumber(openCase)}`}
			disabled={busy}
			onclick={() =>
				pack(openCase!.assetId, {
					assetIds: units.filter((u) => !u.accessoryOf).map((u) => u.assetId)
				})}
		>
			<PackagePlus class="size-4" />
		</Button>
	{/if}
{/snippet}

{#snippet caseButton(c: ListCase)}
	{#if openCase?.assetId === c.assetId}
		<Button variant="ghost" size="sm" onclick={() => (openCaseId = null)}>Close</Button>
	{:else if handout.items.some((i) => i.isPackCase && i.assetId === c.assetId)}
		<Button variant="ghost" size="sm" onclick={() => (openCaseId = c.assetId)}>Open</Button>
	{/if}
{/snippet}

{#snippet defectButton(item: Item)}
	<Button
		size="sm"
		variant="ghost"
		title="Report a defect"
		aria-label="Report a defect"
		onclick={() => openDefect(item)}
	>
		<TriangleAlert class="size-4 text-amber-600 dark:text-amber-500" />
	</Button>
{/snippet}
