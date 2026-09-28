<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { tick as nextTick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import StocktakeProgress from '$lib/components/stocktake-progress.svelte';
	import { getErrorMessage } from '$lib/utils';
	import {
		describeCode,
		findCaseByCode,
		getCaseCheck,
		recordCaseCheck
	} from '$lib/remote/case-checks.remote';

	// Checking a case: scan the case (or open it from its page), then scan or
	// tick what is in it. The ticks live on this page only; finishing writes the
	// outcome into every unit's history. See services/case-check.ts.

	type CaseRef = { kind: 'bundle' | 'asset'; id: string };
	type CaseItem = NonNullable<typeof check>['items'][number];

	let ref = $derived.by((): CaseRef | null => {
		const bundle = page.url.searchParams.get('bundle');
		if (bundle) return { kind: 'bundle', id: bundle };
		const asset = page.url.searchParams.get('asset');
		return asset ? { kind: 'asset', id: asset } : null;
	});

	let checkQuery = $derived(ref ? getCaseCheck(ref) : null);
	let check = $derived(checkQuery?.current);

	const found = new SvelteSet<string>();
	let foreign = $state<{ code: string; name: string | null }[]>([]);
	let result = $state<{ found: number; missing: number; away: number } | null>(null);
	let saving = $state(false);

	// A case opened from elsewhere starts with nothing ticked; one opened by
	// scanning a unit inside it starts with that unit.
	let pendingTick: string | null = null;
	let tickedFor = '';
	$effect.pre(() => {
		const key = ref ? `${ref.kind}:${ref.id}` : '';
		if (key === tickedFor) return;
		tickedFor = key;
		found.clear();
		if (pendingTick) found.add(pendingTick);
		pendingTick = null;
		foreign = [];
		result = null;
	});

	let missing = $derived(
		check ? check.items.filter((i) => !found.has(i.assetId) && !i.awayOn) : []
	);
	let away = $derived(check ? check.items.filter((i) => !found.has(i.assetId) && i.awayOn) : []);
	let progress = $derived({
		expected: check?.items.length ?? 0,
		found: check ? check.items.filter((i) => found.has(i.assetId)).length : 0,
		out: away.length,
		unexpected: foreign.length
	});

	// -------------------------------------------------------------------------
	// Scanning

	let code = $state('');
	let scanning = $state(false);
	let scanInput = $state<HTMLInputElement | null>(null);
	type Feedback = { tone: 'good' | 'warn' | 'bad' | 'info'; title: string; detail?: string };
	let feedback = $state<Feedback | null>(null);

	// A handheld scanner types into whatever has focus, so the field keeps it.
	$effect(() => {
		scanInput?.focus();
	});

	function openCase(next: CaseRef, scannedAssetId: string | null) {
		pendingTick = scannedAssetId;
		const url = `${resolve('/case-check')}?${next.kind}=${encodeURIComponent(next.id)}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		return goto(url, { keepFocus: true });
	}

	/** A code matches a unit by its tag, or by a serial number only one unit in the case has. */
	function match(value: string): CaseItem | null {
		if (!check) return null;
		const byTag = check.items.find((i) => i.assetTag === value);
		if (byTag) return byTag;
		const lower = value.toLowerCase();
		const bySerial = check.items.filter((i) => i.serialNumber?.toLowerCase() === lower);
		return bySerial.length === 1 ? bySerial[0] : null;
	}

	function itemLabel(item: CaseItem) {
		return `${item.name}${item.assetTag ? ` · ${item.assetTag}` : ''}`;
	}

	async function handleScan(e: SubmitEvent) {
		e.preventDefault();
		const value = code.trim();
		if (!value || scanning) return;
		code = '';
		scanning = true;
		try {
			if (!ref || !check) {
				const opened = await findCaseByCode(value);
				await openCase(opened.ref, opened.scannedAssetId);
				return;
			}
			if (check.tag && check.tag === value) {
				feedback = { tone: 'info', title: 'That is the case itself', detail: value };
				return;
			}
			const item = match(value);
			if (item) {
				if (found.has(item.assetId)) {
					feedback = { tone: 'info', title: 'Already ticked', detail: itemLabel(item) };
				} else {
					found.add(item.assetId);
					feedback = { tone: 'good', title: `Found: ${item.name}`, detail: item.assetTag ?? value };
				}
				return;
			}
			const name = await describeCode(value);
			if (!foreign.some((f) => f.code === value)) foreign = [...foreign, { code: value, name }];
			feedback = {
				tone: 'warn',
				title: name ? `Not part of this case: ${name}` : 'Unknown code',
				detail: value
			};
		} catch (err) {
			feedback = { tone: 'bad', title: getErrorMessage(err), detail: value };
		} finally {
			scanning = false;
			await nextTick();
			scanInput?.focus();
		}
	}

	function toggle(item: CaseItem) {
		if (found.has(item.assetId)) found.delete(item.assetId);
		else found.add(item.assetId);
	}

	async function finish() {
		if (!ref) return;
		saving = true;
		try {
			result = await recordCaseCheck({ ref, foundAssetIds: [...found] });
			toast.success('Case check saved to the history');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}

	function formatDate(d: Date) {
		return new Date(d).toLocaleString('de-DE', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head><title>Check a case | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Check a case</h1>
			<p class="text-muted-foreground">
				Scan a kit or a unit with accessories, then scan what is in it to see whether anything is
				missing.
			</p>
		</div>
		{#if ref}
			<Button variant="outline" href={resolve('/case-check')}>Check another case</Button>
		{/if}
	</div>

	<Card.Root>
		<Card.Content class="space-y-3">
			<form class="space-y-2" onsubmit={handleScan}>
				<Label for="case-code">{ref ? 'Scan what is in the case' : 'Scan the case'}</Label>
				<div class="flex gap-2">
					<Input
						id="case-code"
						bind:ref={scanInput}
						bind:value={code}
						autocomplete="off"
						placeholder="Asset tag, bundle tag or serial number"
						disabled={!!result}
					/>
					<Button type="submit" disabled={scanning || !code.trim() || !!result}>
						{ref ? 'Tick' : 'Open'}
					</Button>
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

	{#if checkQuery}
		{#if !checkQuery.ready || !check}
			<ContentSkeleton shape="rows" count={6} error={checkQuery.error} />
		{:else}
			<Card.Root>
				<Card.Header>
					<Card.Title>{check.name}</Card.Title>
					<Card.Description>
						{#if check.checkedOutTo}
							Checked out to {check.checkedOutTo}.
						{/if}
						{#if check.lastCheck}
							Last checked {formatDate(check.lastCheck.at)} by {check.lastCheck.userName}:
							{check.lastCheck.found} of {check.lastCheck.expected} there.
						{:else}
							Never checked before.
						{/if}
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<StocktakeProgress {progress} />

					{#if check.shortOfType.length > 0}
						<div
							class="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
						>
							<p class="font-medium">Other cases of this kit hold more</p>
							<ul class="text-xs">
								{#each check.shortOfType as line (line.name)}
									<li>{line.missing} × {line.name}</li>
								{/each}
							</ul>
						</div>
					{/if}

					<ul class="divide-y rounded-md border">
						{#each check.items as item (item.assetId)}
							<li>
								<label
									class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40 {item.accessoryOf
										? 'pl-9'
										: ''}"
								>
									<input
										type="checkbox"
										checked={found.has(item.assetId)}
										disabled={!!result}
										onchange={() => toggle(item)}
										class="size-4"
									/>
									<ProductThumb path={item.imagePath} alt={item.name} size={40} />
									<span class="min-w-0 flex-1">
										<span class="block truncate font-medium">{item.name}</span>
										<span class="block truncate text-xs text-muted-foreground">
											{item.assetTag ?? 'No tag'} · #{item.orgIndex}{item.caption
												? ` · ${item.caption}`
												: ''}
										</span>
									</span>
									{#if found.has(item.assetId)}
										<span class="text-xs font-medium text-emerald-700 dark:text-emerald-400"
											>Found</span
										>
									{:else if item.awayOn}
										<span class="text-xs text-muted-foreground">Out on {item.awayOn}</span>
									{/if}
								</label>
							</li>
						{/each}
					</ul>

					{#if foreign.length > 0}
						<div class="space-y-1">
							<p class="text-sm font-medium">Scanned but not part of this case</p>
							<ul class="text-sm text-muted-foreground">
								{#each foreign as f (f.code)}
									<li>{f.name ?? 'Unknown code'} · <span class="font-mono">{f.code}</span></li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if result}
						<div
							class="rounded-md border px-3 py-2 text-sm {result.missing === 0
								? 'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
								: 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}"
						>
							{#if result.missing === 0}
								<p class="font-medium">Complete — everything is there.</p>
							{:else}
								<p class="font-medium">{result.missing} missing</p>
							{/if}
							<p class="text-xs">
								{result.found} found.
								{#if result.away > 0}
									{result.away} out on other jobs.
								{/if}
								Saved to the history of every unit in the case.
							</p>
						</div>
					{:else}
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="text-sm text-muted-foreground">
								{#if missing.length === 0}
									Everything is there.
								{:else}
									{missing.length} still missing.
								{/if}
							</p>
							{#if check.canRecord}
								<Button onclick={finish} disabled={saving}>Finish and save</Button>
							{/if}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}
</div>
