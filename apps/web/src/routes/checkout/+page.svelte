<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import { getLocations } from '$lib/remote/assets.remote';
	import { getAllProductions, scanAsset } from '$lib/remote/checkout.remote';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { toast } from 'svelte-sonner';
	import { tick, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Html5Qrcode } from 'html5-qrcode';

	let locations = $derived(await getLocations());
	let productions = $derived(await getAllProductions());

	let locationItems = $derived(
		locations.map((loc) => {
			const addr = [loc.address?.postalCode?.trim(), loc.address?.city?.trim()]
				.filter(Boolean)
				.join(' ');
			const detail = [orgLabel(loc.organization), addr].filter(Boolean).join(' · ');
			return { id: loc.id, name: detail ? `${loc.name} (${detail})` : loc.name };
		})
	);
	let locationSelection = $state<{ id: string | null; name: string } | null>(null);

	let targetType = $state<'location' | 'production'>('location');
	let targetId = $state('');
	let inputMode = $state<'qr' | 'text'>('qr');
	let sessionActive = $state(false);
	let sessionEnded = $state(false);
	let sessionStartedAt = $state<Date | null>(null);
	let sessionEndedAt = $state<Date | null>(null);

	type ScanEntry = {
		id: string;
		assetTag: string;
		productName: string;
		manufacturerName: string;
		action: string;
		targetName: string;
		status: 'success' | 'error';
		message: string;
		timestamp: Date;
	};

	let sessionLog = $state<ScanEntry[]>([]);
	let processing = $state(false);
	let textInput = $state('');

	let scanner: Html5Qrcode | null = null;
	let lastCode = '';
	let lastCodeAt = 0;

	let selectedTargetName = $derived(
		targetType === 'location'
			? (locationSelection?.name ?? '')
			: (() => {
					const p = productions.find((p) => p.id === targetId);
					return p ? `${p.name} (${orgLabel(p.organization)})` : '';
				})()
	);

	let successCount = $derived(sessionLog.filter((e) => e.status === 'success').length);
	let errorCount = $derived(sessionLog.filter((e) => e.status === 'error').length);

	function setTargetType(type: 'location' | 'production') {
		targetType = type;
		targetId = '';
		locationSelection = null;
	}

	async function startSession() {
		if (!targetId) {
			toast.error('Please select a target first');
			return;
		}
		sessionLog = [];
		sessionStartedAt = new Date();
		sessionEndedAt = null;
		sessionEnded = false;
		sessionActive = true;
		if (inputMode === 'qr') {
			await tick();
			await startCamera();
		}
	}

	async function endSession() {
		await stopCamera();
		sessionEndedAt = new Date();
		sessionActive = false;
		sessionEnded = true;
	}

	function newSession() {
		sessionEnded = false;
		targetId = '';
		locationSelection = null;
		sessionLog = [];
		sessionStartedAt = null;
		sessionEndedAt = null;
	}

	async function startCamera() {
		if (!browser) return;
		try {
			const { Html5Qrcode: Lib } = await import('html5-qrcode');
			scanner = new Lib('qr-scanner');
			await scanner.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 250, height: 250 } },
				onScanSuccess,
				() => undefined
			);
		} catch {
			toast.error('Camera access denied. Switched to text input.');
			scanner = null;
			inputMode = 'text';
		}
	}

	async function stopCamera() {
		const s = scanner;
		scanner = null;
		if (s) {
			try {
				await s.stop();
			} catch {
				// ignore
			}
		}
	}

	function onScanSuccess(decodedText: string) {
		const now = Date.now();
		if (decodedText === lastCode && now - lastCodeAt < 2000) return;
		lastCode = decodedText;
		lastCodeAt = now;
		processTag(decodedText);
	}

	async function processTag(tag: string) {
		const t = tag.trim();
		if (!t || processing) return;
		processing = true;
		try {
			const result = await scanAsset({ assetTag: t, targetType, targetId });
			let message = labelAction(result.action);
			if (result.returnedFrom.length > 0) {
				message += ` · returned from ${result.returnedFrom.join(', ')}`;
			}
			sessionLog = [
				{
					id: crypto.randomUUID(),
					assetTag: t,
					productName: result.asset.productName,
					manufacturerName: result.asset.manufacturerName,
					action: result.action,
					targetName: result.targetName,
					status: 'success',
					message,
					timestamp: new Date()
				},
				...sessionLog
			];
		} catch (err) {
			sessionLog = [
				{
					id: crypto.randomUUID(),
					assetTag: t,
					productName: '',
					manufacturerName: '',
					action: '',
					targetName: '',
					status: 'error',
					message: getErrorMessage(err),
					timestamp: new Date()
				},
				...sessionLog
			];
			toast.error(getErrorMessage(err));
		} finally {
			processing = false;
			textInput = '';
		}
	}

	async function handleTextSubmit(e: Event) {
		e.preventDefault();
		await processTag(textInput);
	}

	onDestroy(() => {
		stopCamera();
	});

	function labelAction(action: string) {
		if (action === 'LOCATION_ASSIGNED') return 'Assigned to location';
		if (action === 'CHECKED_OUT') return 'Checked out';
		if (action === 'RETURNED') return 'Returned';
		return action;
	}

	function fmtTime(d: Date) {
		return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function fmtDate(d: Date) {
		return d.toLocaleDateString('de-DE', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Checkout | Technikpool</title>
	<style>
		@media print {
			.no-print {
				display: none !important;
			}
			.print-only {
				display: block !important;
			}
		}
		.print-only {
			display: none;
		}
	</style>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<!-- Page title -->
	<div class="no-print">
		<h1 class="text-3xl font-bold tracking-tight">Checkout / Check-in</h1>
		<p class="text-muted-foreground">
			Scan asset tags to book equipment to a location or production.
		</p>
	</div>

	<!-- Setup card — hidden when session active or ended -->
	{#if !sessionActive && !sessionEnded}
		<Card.Root class="no-print">
			<Card.Header>
				<Card.Title>Session Setup</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-5">
				<!-- Target type -->
				<div class="space-y-2">
					<Label>Target</Label>
					<div class="flex overflow-hidden rounded-md border border-input text-sm font-medium">
						<button
							type="button"
							onclick={() => setTargetType('location')}
							class="flex-1 px-4 py-2 transition-colors {targetType === 'location'
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted'}"
						>
							Location
						</button><button
							type="button"
							onclick={() => setTargetType('production')}
							class="flex-1 px-4 py-2 transition-colors {targetType === 'production'
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted'}"
						>
							Production
						</button>
					</div>
				</div>

				<!-- Target select -->
				{#if targetType === 'location'}
					<div class="space-y-2">
						<Label>Location</Label>
						<CreatableSelect
							items={locationItems}
							bind:value={locationSelection}
							onchange={(sel) => (targetId = sel?.id ?? '')}
							placeholder="Search locations…"
							allowCreate={false}
						/>
					</div>
				{:else}
					<div class="space-y-2">
						<Label for="target-production">Production</Label>
						<select
							id="target-production"
							bind:value={targetId}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
						>
							<option value="" disabled>Select a production…</option>
							{#each productions as prod (prod.id)}
								<option value={prod.id}>{prod.name} — {orgLabel(prod.organization)}</option>
							{/each}
						</select>
					</div>
				{/if}

				<!-- Input mode -->
				<div class="space-y-2">
					<Label>Input Mode</Label>
					<div class="flex overflow-hidden rounded-md border border-input text-sm font-medium">
						<button
							type="button"
							onclick={() => (inputMode = 'qr')}
							class="flex-1 px-4 py-2 transition-colors {inputMode === 'qr'
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted'}"
						>
							QR Scanner
						</button><button
							type="button"
							onclick={() => (inputMode = 'text')}
							class="flex-1 px-4 py-2 transition-colors {inputMode === 'text'
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted'}"
						>
							Text Input
						</button>
					</div>
				</div>
			</Card.Content>
			<Card.Footer>
				<Button onclick={startSession} disabled={!targetId}>Start Session</Button>
			</Card.Footer>
		</Card.Root>
	{/if}

	<!-- Active scanner card -->
	{#if sessionActive}
		<Card.Root class="no-print">
			<Card.Header>
				<div class="flex items-center justify-between gap-4">
					<div>
						<Card.Title>Active Session</Card.Title>
						<Card.Description>{selectedTargetName}</Card.Description>
					</div>
					<Button variant="outline" onclick={endSession}>End Session</Button>
				</div>
			</Card.Header>
			<Card.Content>
				{#if inputMode === 'qr'}
					<div id="qr-scanner" class="overflow-hidden rounded-md"></div>
					{#if processing}
						<div class="mt-2 flex justify-center">
							<span
								class="rounded-full bg-yellow-400 px-3 py-1 text-xs font-medium text-yellow-900"
							>
								Processing…
							</span>
						</div>
					{/if}
				{:else}
					<form class="flex gap-2" onsubmit={handleTextSubmit}>
						<Input
							type="text"
							placeholder="Type or scan asset tag…"
							bind:value={textInput}
							disabled={processing}
							autofocus
							class="font-mono"
						/>
						<Button type="submit" disabled={processing || !textInput.trim()}>
							{processing ? '…' : 'Submit'}
						</Button>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Session log + report -->
	{#if sessionLog.length > 0 || sessionEnded}
		<div>
			<!-- Print header (hidden on screen) -->
			<div class="print-only mb-6 space-y-1">
				<h1 class="text-2xl font-bold">Checkout Session Report</h1>
				<p><strong>Target:</strong> {selectedTargetName}</p>
				{#if sessionStartedAt}
					<p><strong>Started:</strong> {fmtDate(sessionStartedAt)}</p>
				{/if}
				{#if sessionEndedAt}
					<p><strong>Ended:</strong> {fmtDate(sessionEndedAt)}</p>
				{/if}
				<p>
					<strong>Total:</strong>
					{sessionLog.length} scans — {successCount} success, {errorCount} errors
				</p>
			</div>

			<div class="no-print mb-3 flex items-center justify-between gap-4">
				<div>
					<h2 class="text-lg font-semibold">Session Log</h2>
					<p class="text-sm text-muted-foreground">
						{sessionLog.length} scan{sessionLog.length !== 1 ? 's' : ''} — {successCount} success{successCount !==
						1
							? 'es'
							: ''}, {errorCount} error{errorCount !== 1 ? 's' : ''}
					</p>
				</div>
				{#if sessionEnded}
					<div class="flex gap-2">
						<Button icon="print" variant="outline" onclick={() => window.print()}
							>Print Report</Button
						>
						<Button icon="add" onclick={newSession}>New Session</Button>
					</div>
				{/if}
			</div>

			<div class="overflow-hidden rounded-md border">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/30">
							<th class="px-3 py-2.5 text-left font-medium text-muted-foreground">Time</th>
							<th class="px-3 py-2.5 text-left font-medium text-muted-foreground">Tag</th>
							<th class="px-3 py-2.5 text-left font-medium text-muted-foreground">Product</th>
							<th class="px-3 py-2.5 text-left font-medium text-muted-foreground">Action</th>
							<th class="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
						</tr>
					</thead>
					<tbody>
						{#each sessionLog as entry (entry.id)}
							<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
								<td class="px-3 py-2 font-mono text-xs text-muted-foreground">
									{fmtTime(entry.timestamp)}
								</td>
								<td class="px-3 py-2 font-mono text-xs">{entry.assetTag}</td>
								<td class="px-3 py-2">
									{#if entry.productName}
										<p class="font-medium">{entry.productName}</p>
										<p class="text-xs text-muted-foreground">{entry.manufacturerName}</p>
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</td>
								<td class="px-3 py-2 text-sm text-muted-foreground">
									{entry.message}
								</td>
								<td class="px-3 py-2">
									{#if entry.status === 'success'}
										<span
											class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-300"
										>
											OK
										</span>
									{:else}
										<span
											class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900 dark:text-red-300"
										>
											Error
										</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
