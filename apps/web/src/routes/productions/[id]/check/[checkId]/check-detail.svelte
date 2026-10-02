<script lang="ts">
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import StocktakeProgress from '$lib/components/stocktake-progress.svelte';
	import { ScanBar, TickList, type ScanFeedback } from '$lib/components/production-list';
	import { listSections, type ListLine } from '$lib/production-list';
	import { getErrorMessage, plural } from '$lib/utils';
	import {
		closeCheck,
		confirmCheckReceipt,
		getProductionCheck,
		reportCheckReturn,
		scanProductionCheck,
		setProductionCheckLine,
		tickProductionCheck,
		untickProductionCheck
	} from '$lib/remote/production-checks.remote';

	// Checking a production against its list: scan, tick or count, as often as
	// needed, with others ticking into the same list. On the production's own
	// side a check is also where lent units are confirmed as received or
	// reported as sent back. See services/production-check.ts.

	let { checkId }: { checkId: string } = $props();

	let check = $derived(await getProductionCheck(checkId));
	let isOpen = $derived(check.status === 'OPEN');
	type Item = (typeof check.items)[number];

	// Others tick at the same time, on handhelds and in other tabs, and nothing
	// tells this page when they do — so it reloads every few seconds while in
	// front, as a stocktake does.
	$effect(() => {
		if (!isOpen) return;
		const reload = () => {
			if (document.visibilityState === 'visible') getProductionCheck(checkId).refresh();
		};
		const timer = setInterval(reload, 10_000);
		document.addEventListener('visibilitychange', reload);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', reload);
		};
	});

	let progress = $derived({
		expected: check.items.length,
		found: check.items.filter((i) => i.tick).length,
		out: 0,
		unexpected: check.unexpected.length
	});
	let remaining = $derived(check.items.filter((i) => !i.tick));
	let sections = $derived(listSections(check.items, check.lines));

	function unitState(item: Item) {
		return {
			done: !!item.tick,
			locked: !!item.tick && !item.tick.mine,
			doneBy: item.tick && !item.tick.mine ? item.tick.userName : null,
			note:
				item.status === 'APPROVED'
					? { text: 'Not out yet', tone: 'muted' as const }
					: item.lentBy && item.returnReported
						? { text: 'Return reported', tone: 'muted' as const }
						: item.lentBy && item.received
							? { text: 'Received', tone: 'muted' as const }
							: item.lentBy
								? { text: 'Receipt open', tone: 'warn' as const }
								: null
		};
	}

	// -------------------------------------------------------------------------
	// Scanning, ticking, counting

	let busy = $state(false);

	async function submitCode(value: string): Promise<ScanFeedback> {
		const result = await scanProductionCheck({ checkId, code: value });
		const detail = result.assetTag;
		if (result.result === 'ticked') {
			return {
				tone: 'good',
				title:
					result.ticked > 1
						? `Found: ${result.productName} (+${result.ticked - 1} accessories)`
						: `Found: ${result.productName}`,
				detail
			};
		}
		if (result.result === 'already') {
			return { tone: 'info', title: `Already ticked: ${result.productName}`, detail };
		}
		return { tone: 'warn', title: `Not on this list: ${result.productName}`, detail };
	}

	async function toggle(item: Item) {
		try {
			if (item.tick) await untickProductionCheck({ checkId, assetId: item.assetId });
			else await tickProductionCheck({ checkId, assetIds: [item.assetId] });
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function count(line: ListLine, n: number) {
		busy = true;
		try {
			await setProductionCheckLine({ checkId, key: line.key, count: n });
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}

	/** Every open unit, counted lines included — they are units too. */
	async function tickAll(items: Item[] = remaining) {
		busy = true;
		try {
			await tickProductionCheck({
				checkId,
				assetIds: items.filter((i) => !i.tick).map((i) => i.assetId)
			});
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}

	function tickSection(units: Item[], lines: ListLine[]) {
		const counted = new Set(lines.flatMap((l) => l.assetIds));
		return tickAll([...units, ...check.items.filter((i) => counted.has(i.assetId))]);
	}

	// -------------------------------------------------------------------------
	// Handover and closing

	async function confirm() {
		busy = true;
		try {
			const { count } = await confirmCheckReceipt(checkId);
			toast.success(
				plural(count, ['Receipt confirmed for 1 unit', 'Receipt confirmed for # units'])
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}

	async function reportBack() {
		busy = true;
		try {
			const { count } = await reportCheckReturn(checkId);
			toast.success(plural(count, ['1 unit reported as returned', '# units reported as returned']));
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}

	async function finish() {
		busy = true;
		try {
			const result = await closeCheck({ checkId, productionId: check.productionId });
			toast.success(
				result.missing === 0
					? 'Check saved — everything is there'
					: plural(result.missing, [
							'Check saved — 1 unit missing',
							'Check saved — # units missing'
						])
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}

	function formatDate(d: Date) {
		return new Date(d).toLocaleString('de-DE', {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head><title>Check {check.productionName} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Check: {check.productionName}</h1>
			<p class="text-muted-foreground">
				{#if check.side.own}
					Everything on the production.
				{:else}
					Only the units of {check.side.organizationName}.
				{/if}
				Started {formatDate(check.createdAt)} by {check.createdBy}.
				{#if check.closedAt}
					Closed {formatDate(check.closedAt)} by {check.closedBy}.
				{/if}
			</p>
		</div>
		<Button variant="outline" href={resolve(`/productions/${check.productionId}`)}
			>Back to the production</Button
		>
	</div>

	{#if isOpen}
		<Card.Root>
			<Card.Content>
				<ScanBar
					id="check-code"
					label="Scan what is there"
					buttonLabel="Tick"
					submit={submitCode}
				/>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if check.canConfirmReceipt > 0 || check.canReportReturn > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>Lent equipment</Card.Title>
				<Card.Description>
					Applies to the ticked units other organizations lent to this production.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-2">
				{#if check.canConfirmReceipt > 0}
					<Button onclick={confirm} disabled={busy}>
						{plural(check.canConfirmReceipt, [
							'Confirm receipt of 1 unit',
							'Confirm receipt of # units'
						])}
					</Button>
				{/if}
				{#if check.canReportReturn > 0}
					<Button variant="outline" onclick={reportBack} disabled={busy}>
						{plural(check.canReportReturn, ['Report 1 unit returned', 'Report # units returned'])}
					</Button>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Content class="space-y-4">
			<StocktakeProgress {progress} />

			{#if check.items.length === 0}
				<p class="text-sm text-muted-foreground">Nothing is booked for this production yet.</p>
			{:else}
				<TickList
					{sections}
					{unitState}
					enabled={isOpen}
					{busy}
					doneLabel="Found"
					tickSectionLabel="Tick section"
					ontoggle={toggle}
					oncount={count}
					ontickSection={tickSection}
				/>
			{/if}

			{#if check.unexpected.length > 0}
				<div class="space-y-1">
					<p class="text-sm font-medium">Scanned but not on this list</p>
					<ul class="text-sm text-muted-foreground">
						{#each check.unexpected as u (u.assetId)}
							<li>{u.productName} · <span class="font-mono">{u.assetTag ?? '—'}</span></li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if isOpen}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-sm text-muted-foreground">
						{#if remaining.length === 0}
							Everything is there.
						{:else}
							{remaining.length} still missing.
						{/if}
					</p>
					<div class="flex flex-wrap gap-2">
						{#if remaining.length > 0}
							<Button variant="outline" onclick={() => tickAll()} disabled={busy}>Tick all</Button>
						{/if}
						<Button onclick={finish} disabled={busy}>Finish and save</Button>
					</div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
