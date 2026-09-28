<script lang="ts">
	import { resolve } from '$app/paths';
	import { tick as nextTick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CameraScanButton } from '$lib/components/ui/camera-scan';
	import StocktakeProgress from '$lib/components/stocktake-progress.svelte';
	import { Handshake, MapPin } from '@lucide/svelte';
	import { getErrorMessage, plural } from '$lib/utils';
	import {
		closeCheck,
		confirmCheckReceipt,
		getProductionCheck,
		reportCheckReturn,
		scanProductionCheck,
		tickProductionCheck,
		untickProductionCheck
	} from '$lib/remote/production-checks.remote';

	// Checking a production against its list: scan or tick, as often as needed,
	// with others ticking into the same list. On the production's own side a
	// check is also where lent units are confirmed as received or reported as
	// sent back. See services/production-check.ts.

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

	// The server sends the items sorted by section; a new heading starts
	// wherever the section changes.
	let sections = $derived.by(() => {
		const out: { key: string; group: Item['group']; items: Item[] }[] = [];
		for (const item of check.items) {
			const key = `${item.group.kind}:${item.group.name ?? ''}`;
			const last = out.at(-1);
			if (last?.key === key) last.items.push(item);
			else out.push({ key, group: item.group, items: [item] });
		}
		return out;
	});

	// -------------------------------------------------------------------------
	// Scanning

	let code = $state('');
	let scanInput = $state<HTMLInputElement | null>(null);
	type Feedback = { tone: 'good' | 'warn' | 'bad' | 'info'; title: string; detail?: string };
	let feedback = $state<Feedback | null>(null);
	let busy = $state(false);

	// A handheld scanner types into whatever has focus, so the field keeps it.
	$effect(() => {
		scanInput?.focus();
	});

	function handleScan(e: SubmitEvent) {
		e.preventDefault();
		enqueue(code);
		code = '';
	}

	// One code after another: the camera can read the next label while the
	// last one is still being looked up.
	let queue = Promise.resolve();
	function enqueue(raw: string) {
		const value = raw.trim();
		if (value && isOpen) queue = queue.then(() => submitCode(value));
	}

	async function submitCode(value: string) {
		try {
			const result = await scanProductionCheck({ checkId, code: value });
			const detail = result.assetTag;
			if (result.result === 'ticked') {
				feedback = {
					tone: 'good',
					title:
						result.ticked > 1
							? `Found: ${result.productName} (+${result.ticked - 1} accessories)`
							: `Found: ${result.productName}`,
					detail
				};
			} else if (result.result === 'already') {
				feedback = { tone: 'info', title: `Already ticked: ${result.productName}`, detail };
			} else {
				feedback = { tone: 'warn', title: `Not on this list: ${result.productName}`, detail };
			}
		} catch (err) {
			feedback = { tone: 'bad', title: getErrorMessage(err), detail: value };
		} finally {
			await nextTick();
			scanInput?.focus();
		}
	}

	async function toggle(item: Item) {
		try {
			if (item.tick) await untickProductionCheck({ checkId, assetId: item.assetId });
			else await tickProductionCheck({ checkId, assetIds: [item.assetId] });
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

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
			<Card.Content class="space-y-3">
				<form class="space-y-2" onsubmit={handleScan}>
					<Label for="check-code">Scan what is there</Label>
					<div class="flex gap-2">
						<Input
							id="check-code"
							bind:ref={scanInput}
							bind:value={code}
							autocomplete="off"
							placeholder="Asset tag or serial number"
						/>
						<CameraScanButton continuous onscan={enqueue} {feedback} />
						<Button type="submit" disabled={!code.trim()}>Tick</Button>
					</div>
				</form>
				{#if feedback}
					<div
						class="rounded-md border px-3 py-2 text-sm {feedback.tone === 'good'
							? 'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
							: feedback.tone === 'warn'
								? 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
								: feedback.tone === 'bad'
									? 'border-destructive/40 bg-destructive/10 text-destructive'
									: 'bg-muted/50'}"
						role="status"
					>
						<p class="font-medium">{feedback.title}</p>
						{#if feedback.detail}<p class="text-xs opacity-80">{feedback.detail}</p>{/if}
					</div>
				{/if}
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
				<div class="space-y-4">
					{#each sections as section (section.key)}
						{@const open = section.items.filter((i) => !i.tick).length}
						<section class="space-y-1.5">
							<div class="flex items-center justify-between gap-3">
								<h3 class="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
									{#if section.group.kind === 'lender'}
										<Handshake aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
										<span class="truncate">Lent by {section.group.name}</span>
									{:else if section.group.kind === 'location'}
										<MapPin aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
										<span class="truncate">{section.group.name}</span>
									{:else}
										<MapPin aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
										<span class="truncate">No location</span>
									{/if}
									<span class="font-normal text-muted-foreground tabular-nums"
										>{section.items.length - open} / {section.items.length}</span
									>
								</h3>
								{#if isOpen && open > 0}
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onclick={() => tickAll(section.items)}>Tick section</Button
									>
								{/if}
							</div>
							<ul class="divide-y rounded-md border">
								{#each section.items as item (item.assetId)}
									{@const lockedByOther = !!item.tick && !item.tick.mine}
									<li>
										<label
											class="flex items-center gap-3 px-3 py-2 {isOpen && !lockedByOther
												? 'cursor-pointer hover:bg-muted/40'
												: ''} {item.accessoryOf ? 'pl-9' : ''}"
										>
											<input
												type="checkbox"
												checked={!!item.tick}
												disabled={!isOpen || lockedByOther}
												onchange={() => toggle(item)}
												class="size-4"
											/>
											<span class="min-w-0 flex-1">
												<span class="block truncate font-medium">{item.productName}</span>
												<span class="block truncate text-xs text-muted-foreground">
													{item.assetTag ?? 'No tag'}{item.productCaption
														? ` · ${item.productCaption}`
														: ''}
												</span>
											</span>
											<span class="flex shrink-0 flex-col items-end gap-0.5 text-xs">
												{#if item.tick}
													<span class="font-medium text-emerald-700 dark:text-emerald-400"
														>{item.tick.mine ? 'Found' : `Found by ${item.tick.userName}`}</span
													>
												{/if}
												{#if item.status === 'APPROVED'}
													<span class="text-muted-foreground">Not out yet</span>
												{:else if item.lentBy && item.returnReported}
													<span class="text-muted-foreground">Return reported</span>
												{:else if item.lentBy && item.received}
													<span class="text-muted-foreground">Received</span>
												{:else if item.lentBy}
													<span class="text-amber-700 dark:text-amber-400">Receipt open</span>
												{/if}
											</span>
										</label>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
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
