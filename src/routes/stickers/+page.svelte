<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';

	const orgs = await getMyOrgs();

	const SETTINGS_KEY = 'stickers.settings.v1';

	interface PersistedSettings {
		selectedOrgId?: string;
		type?: 'quadratisch' | 'faehnchen';
		color?: string;
		brandText?: string;
		logoText?: string;
		from?: number;
		to?: number;
		copies?: number;
		payloadTemplate?: string;
		labelPrefix?: string;
		padLength?: number;
		advanced?: boolean;
		pageWidthMm?: number;
		pageHeightMm?: number;
		widthMm?: number;
		heightMm?: number;
		columns?: number;
		rows?: number;
		marginLeftMm?: number;
		marginTopMm?: number;
		gapXMm?: number;
		gapYMm?: number;
		matrixScale?: number;
		quietZoneMm?: number;
		bleedMm?: number;
		tailLenMm?: number;
		nestFlagTails?: boolean;
	}

	function loadSavedSettings(): PersistedSettings {
		if (!browser) return {};
		try {
			const raw = localStorage.getItem(SETTINGS_KEY);
			return raw ? (JSON.parse(raw) as PersistedSettings) : {};
		} catch {
			return {};
		}
	}

	const saved = loadSavedSettings();

	let selectedOrgId = $state(saved.selectedOrgId ?? orgs[0]?.id ?? '');
	let type = $state<'quadratisch' | 'faehnchen'>(saved.type ?? 'quadratisch');
	let color = $state(saved.color ?? '#0069c9');
	let brandText = $state(saved.brandText ?? orgs[0]?.name ?? '');
	let logoText = $state(saved.logoText ?? 'RE');
	let from = $state(saved.from ?? 1);
	let to = $state(saved.to ?? 150);
	let copies = $state(saved.copies ?? 1);
	let payloadTemplate = $state(saved.payloadTemplate ?? '{label}');
	let labelPrefix = $state(saved.labelPrefix ?? orgs[0]?.assetIdPrefix ?? 'RE');
	let padLength = $state(saved.padLength ?? 5);
	let advanced = $state(saved.advanced ?? false);
	const payloadPlaceholder = 'https://technik.example/assets/{label}';
	const matrixPreviewCells = Array.from({ length: 25 }, (_value, index) => index);
	let generating = $state(false);

	let pageWidthMm = $state(saved.pageWidthMm ?? 303);
	let pageHeightMm = $state(saved.pageHeightMm ?? 216);
	let widthMm = $state(saved.widthMm ?? 15);
	let heightMm = $state(saved.heightMm ?? 15);
	let columns = $state(saved.columns ?? 15);
	let rows = $state(saved.rows ?? 10);
	let marginLeftMm = $state(saved.marginLeftMm ?? 6);
	let marginTopMm = $state(saved.marginTopMm ?? 13);
	let gapXMm = $state(saved.gapXMm ?? 10);
	let gapYMm = $state(saved.gapYMm ?? 10);
	let matrixScale = $state(saved.matrixScale ?? 0.68);
	let quietZoneMm = $state(saved.quietZoneMm ?? 1.1);
	const initialType = saved.type ?? 'quadratisch';
	let bleedMm = $state(saved.bleedMm ?? (initialType === 'faehnchen' ? 1.3 : 3));
	let tailLenMm = $state(saved.tailLenMm ?? 31);
	let nestFlagTails = $state(saved.nestFlagTails ?? initialType === 'faehnchen');

	let selectedOrg = $derived(orgs.find((org) => org.id === selectedOrgId));
	let totalLabels = $derived(Math.max(0, to - from + 1) * copies);
	let labelsPerPage = $derived(columns * rows);
	let pageCount = $derived(Math.max(1, Math.ceil(totalLabels / labelsPerPage)));
	let sampleLabel = $derived(`${labelPrefix}${String(from).padStart(padLength, '0')}`);
	let samplePayload = $derived(
		payloadTemplate.replaceAll('{label}', sampleLabel).replaceAll('{number}', String(from))
	);
	// Inverse of the wrap-around-cable formula: given a tail length, what cable
	// diameters does it support? Reaches at least halfway back for the max
	// diameter without overshooting the body's left edge for the min diameter.
	let maxSupportedDiameterMm = $derived((tailLenMm - widthMm / 2) / Math.PI);
	let minSupportedDiameterMm = $derived(Math.max(0, (tailLenMm - widthMm) / Math.PI));
	let tailTooShort = $derived(maxSupportedDiameterMm < 0);
	let colorValid = $derived(/^#[0-9a-fA-F]{6}$/.test(color));

	$effect(() => {
		if (!browser) return;
		const settings: PersistedSettings = {
			selectedOrgId,
			type,
			color,
			brandText,
			logoText,
			from,
			to,
			copies,
			payloadTemplate,
			labelPrefix,
			padLength,
			advanced,
			pageWidthMm,
			pageHeightMm,
			widthMm,
			heightMm,
			columns,
			rows,
			marginLeftMm,
			marginTopMm,
			gapXMm,
			gapYMm,
			matrixScale,
			quietZoneMm,
			bleedMm,
			tailLenMm,
			nestFlagTails
		};
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	});

	function applyTypeDefaults(nextType: 'quadratisch' | 'faehnchen') {
		type = nextType;
		if (nextType === 'quadratisch') {
			widthMm = 15;
			heightMm = 15;
			columns = 12;
			rows = 8;
			marginLeftMm = 6;
			marginTopMm = 13;
			gapXMm = 10;
			gapYMm = 10;
			bleedMm = 3;
		} else {
			widthMm = 25;
			heightMm = 15;
			columns = 4;
			rows = 7;
			marginLeftMm = 8;
			marginTopMm = 16;
			gapXMm = 10;
			gapYMm = 10;
			tailLenMm = 31;
			nestFlagTails = true;
			// Nesting needs bleed <= height * 0.09 (see the tail geometry note in
			// pdf.ts) — 15mm's default 3mm bleed doesn't fit that, so use a
			// smaller nesting-safe default instead.
			bleedMm = 1.3;
		}
	}

	function useOrgPrefix() {
		labelPrefix = selectedOrg?.assetIdPrefix ?? labelPrefix;
	}

	async function generatePdf() {
		if (to < from) {
			toast.error('End number must be greater than or equal to start number');
			return;
		}
		if (!colorValid) {
			toast.error('Sticker color must be a #RRGGBB hex value');
			return;
		}
		generating = true;
		try {
			const response = await fetch('/api/stickers/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type,
					color,
					brandText,
					logoText,
					items: [{ from, to, copies, payloadTemplate, labelPrefix, padLength }],
					size: { widthMm, heightMm, flagTailMm: type === 'faehnchen' ? tailLenMm : undefined },
					layout: {
						pageWidthMm,
						pageHeightMm,
						marginLeftMm,
						marginTopMm,
						gapXMm,
						gapYMm,
						columns,
						rows,
						headerHeightMm: 10
					},
					matrixScale,
					quietZoneMm,
					bleedMm,
					nestFlagTails: type === 'faehnchen' ? nestFlagTails : undefined
				})
			});

			if (!response.ok) {
				const error = await response
					.json()
					.catch(() => ({ message: 'Could not generate sticker sheet' }));
				throw new Error(error.message);
			}

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download =
				type === 'faehnchen' ? 'stickerbogen-faehnchen.pdf' : 'stickerbogen-quadratisch.pdf';
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			toast.success('Sticker sheet generated');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not generate sticker sheet');
		} finally {
			generating = false;
		}
	}
</script>

<svelte:head><title>Sticker Sheets | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Sticker sheets</h1>
		<p class="text-sm text-muted-foreground">
			Generate Data Matrix sticker sheets for Technikpool asset tags, with presets for
			wir-machen-druck.de square stickers and flag labels.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-[1fr_360px]">
		<Card.Root>
			<Card.Header>
				<Card.Title>Sticker configuration</Card.Title>
				<Card.Description
					>Choose the format, numbering, branding, and Data Matrix payload.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<form
					class="space-y-8"
					onsubmit={(event) => {
						event.preventDefault();
						generatePdf();
					}}
				>
					<div class="space-y-3">
						<Label>Sticker type</Label>
						<div class="grid gap-3 sm:grid-cols-2">
							<button
								type="button"
								onclick={() => applyTypeDefaults('quadratisch')}
								class="rounded-2xl border p-4 text-left transition hover:bg-muted/50 {type ===
								'quadratisch'
									? 'border-primary bg-primary/5 ring-2 ring-primary/20'
									: ''}"
							>
								<div class="font-semibold">Square stickers</div>
								<div class="mt-1 text-sm text-muted-foreground">
									Dense 15 × 10 sheets for compact asset labels.
								</div>
							</button>
							<button
								type="button"
								onclick={() => applyTypeDefaults('faehnchen')}
								class="rounded-2xl border p-4 text-left transition hover:bg-muted/50 {type ===
								'faehnchen'
									? 'border-primary bg-primary/5 ring-2 ring-primary/20'
									: ''}"
							>
								<div class="font-semibold">Flag labels</div>
								<div class="mt-1 text-sm text-muted-foreground">
									Long labels with a fold marker for cables and small gear.
								</div>
							</button>
						</div>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<Label for="org">Organization</Label>
							<select
								id="org"
								bind:value={selectedOrgId}
								onchange={useOrgPrefix}
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
							>
								{#each orgs as org (org.id)}<option value={org.id}>{org.name}</option>{/each}
							</select>
						</div>
						<div class="space-y-2">
							<Label for="color">Sticker color</Label>
							<div class="flex gap-2">
								<Input id="color" type="color" bind:value={color} class="h-10 w-14 p-1" />
								<Input
									bind:value={color}
									class="font-mono {colorValid ? '' : 'border-destructive'}"
									aria-invalid={!colorValid}
								/>
							</div>
							{#if !colorValid}
								<p class="text-sm text-destructive">Enter a color as #RRGGBB, e.g. #0069c9.</p>
							{/if}
						</div>
						<div class="space-y-2">
							<Label for="brand">Header brand</Label>
							<Input id="brand" bind:value={brandText} placeholder="Rüger Events" />
						</div>
						<div class="space-y-2">
							<Label for="logo">Sticker logo text</Label>
							<Input id="logo" bind:value={logoText} placeholder="RE" maxlength={12} />
						</div>
					</div>

					{#if type === 'faehnchen'}
						<div class="rounded-2xl border bg-muted/20 p-4">
							<h2 class="font-semibold">Cable tail</h2>
							<p class="text-sm text-muted-foreground">
								The tail wraps once around the cable and folds back between the two halves. Pick a
								tail length and see which cable diameters it supports below.
							</p>
							<div class="mt-4 grid gap-4 sm:grid-cols-3">
								<div class="space-y-2">
									<Label for="tailLen">Tail length (mm)</Label>
									<Input id="tailLen" type="number" min="1" step="0.5" bind:value={tailLenMm} />
								</div>
								<div class="space-y-2">
									<Label>Supports diameter down to</Label>
									<p class="flex h-10 items-center font-mono text-sm">
										{minSupportedDiameterMm.toFixed(1)} mm
									</p>
								</div>
								<div class="space-y-2">
									<Label>Supports diameter up to</Label>
									<p class="flex h-10 items-center font-mono text-sm">
										{tailTooShort ? '—' : maxSupportedDiameterMm.toFixed(1)} mm
									</p>
								</div>
							</div>
							{#if tailTooShort}
								<p class="mt-2 text-sm text-destructive">
									This tail is too short to reliably wrap any cable and still overlap the body —
									increase the tail length or reduce the sticker width.
								</p>
							{/if}
							<label class="mt-4 flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									bind:checked={nestFlagTails}
									class="h-4 w-4 rounded border-input"
								/>
								Nest every second tail to save space
							</label>
							<p class="mt-1 text-xs text-muted-foreground">
								Rotates every second sticker 180° so its tail nests against its neighbor's, instead
								of each sticker needing its own full tail length of sheet width. Needs enough
								sticker height that the two tails' bleeds don't touch.
							</p>
						</div>
					{/if}

					<div class="rounded-2xl border bg-muted/20 p-4">
						<div class="mb-4 flex items-center justify-between gap-3">
							<div>
								<h2 class="font-semibold">Number range</h2>
								<p class="text-sm text-muted-foreground">
									Use <code>{'{label}'}</code> for the full visible asset tag or
									<code>{'{number}'}</code> for just the number.
								</p>
							</div>
							<Button type="button" variant="outline" onclick={useOrgPrefix}>Use org prefix</Button>
						</div>
						<div class="grid gap-4 md:grid-cols-5">
							<div class="space-y-2">
								<Label for="prefix">Prefix</Label>
								<Input id="prefix" bind:value={labelPrefix} class="font-mono" />
							</div>
							<div class="space-y-2">
								<Label for="from">From</Label>
								<Input id="from" type="number" min="0" bind:value={from} />
							</div>
							<div class="space-y-2">
								<Label for="to">To</Label>
								<Input id="to" type="number" min="0" bind:value={to} />
							</div>
							<div class="space-y-2">
								<Label for="pad">Padding</Label>
								<Input id="pad" type="number" min="0" max="12" bind:value={padLength} />
							</div>
							<div class="space-y-2">
								<Label for="copies">Copies each</Label>
								<Input id="copies" type="number" min="1" bind:value={copies} />
							</div>
						</div>
						<div class="mt-4 space-y-2">
							<Label for="payload">Data Matrix payload template</Label>
							<Input id="payload" bind:value={payloadTemplate} placeholder={payloadPlaceholder} />
							<p class="text-xs text-muted-foreground">
								Example payload: <span class="font-mono">{samplePayload}</span>
							</p>
						</div>
					</div>

					<div class="space-y-4">
						<button
							type="button"
							class="text-sm font-medium text-primary underline-offset-4 hover:underline"
							onclick={() => (advanced = !advanced)}
						>
							{advanced ? 'Hide print layout settings' : 'Show print layout settings'}
						</button>
						{#if advanced}
							<div class="grid gap-4 rounded-2xl border p-4 md:grid-cols-4">
								<div class="space-y-2">
									<Label>Page width mm</Label><Input
										type="number"
										step="0.1"
										bind:value={pageWidthMm}
									/>
								</div>
								<div class="space-y-2">
									<Label>Page height mm</Label><Input
										type="number"
										step="0.1"
										bind:value={pageHeightMm}
									/>
								</div>
								<div class="space-y-2">
									<Label>Sticker width mm{type === 'faehnchen' ? ' (body only)' : ''}</Label><Input
										type="number"
										step="0.1"
										bind:value={widthMm}
									/>
								</div>
								<div class="space-y-2">
									<Label>Sticker height mm</Label><Input
										type="number"
										step="0.1"
										bind:value={heightMm}
									/>
								</div>
								<div class="space-y-2">
									<Label>Columns</Label><Input type="number" min="1" bind:value={columns} />
								</div>
								<div class="space-y-2">
									<Label>Rows</Label><Input type="number" min="1" bind:value={rows} />
								</div>
								<div class="space-y-2">
									<Label>Left margin mm</Label><Input
										type="number"
										step="0.1"
										bind:value={marginLeftMm}
									/>
								</div>
								<div class="space-y-2">
									<Label>Top margin mm</Label><Input
										type="number"
										step="0.1"
										bind:value={marginTopMm}
									/>
								</div>
								<div class="space-y-2">
									<Label>Horizontal gap mm</Label><Input
										type="number"
										step="0.1"
										bind:value={gapXMm}
									/>
								</div>
								<div class="space-y-2">
									<Label>Vertical gap mm</Label><Input
										type="number"
										step="0.1"
										bind:value={gapYMm}
									/>
								</div>
								<div class="space-y-2">
									<Label>Matrix scale</Label><Input
										type="number"
										min="0.1"
										max="1"
										step="0.01"
										bind:value={matrixScale}
									/>
								</div>
								<div class="space-y-2">
									<Label>Quiet zone mm</Label><Input
										type="number"
										min="0"
										step="0.1"
										bind:value={quietZoneMm}
									/>
								</div>
								<div class="space-y-2">
									<Label>Bleed mm</Label><Input
										type="number"
										min="0.5"
										step="0.5"
										bind:value={bleedMm}
									/>
									<p class="text-xs text-muted-foreground">
										Smaller bleed allows a smaller gap between stickers.
									</p>
								</div>
							</div>
						{/if}
					</div>

					<div class="flex justify-end gap-3 border-t pt-6">
						<Button type="button" variant="outline" href="/assets">Back to devices</Button>
						<Button type="submit" disabled={generating}
							>{generating ? 'Generating…' : 'Generate PDF'}</Button
						>
					</div>
				</form>
			</Card.Content>
		</Card.Root>

		<aside class="space-y-4">
			<Card.Root class="sticky top-24">
				<Card.Header>
					<Card.Title>Live preview</Card.Title>
					<Card.Description
						>Approximate visual preview. The downloaded file is the print PDF.</Card.Description
					>
				</Card.Header>
				<Card.Content class="space-y-5">
					<div class="rounded-2xl border bg-muted/20 p-5">
						<div
							class="relative mx-auto h-40 max-w-64 rounded-xl shadow-lg"
							style:background-color={color}
						>
							{#if type === 'faehnchen'}<div
									class="absolute top-1/2 right-0 h-8 w-16 translate-x-10 -translate-y-1/2 rounded-r-md"
									style:background-color={color}
								></div>
								<div
									class="absolute top-1/2 left-0 h-px w-2/3 border-t border-dashed border-white/90"
								></div>{/if}
							<div
								class="absolute top-4 left-4 grid h-24 w-24 grid-cols-5 gap-0.5 rounded-md bg-white p-2"
							>
								{#each matrixPreviewCells as i (i)}<span
										class="block rounded-[1px] {i % 3 === 0 || i % 7 === 0
											? 'bg-black'
											: 'bg-zinc-200'}"
									></span>{/each}
							</div>
							<div class="absolute bottom-4 left-4 font-mono text-sm font-semibold text-white">
								{sampleLabel}
							</div>
							<div class="absolute right-4 bottom-4 text-sm font-bold text-white">{logoText}</div>
						</div>
					</div>
					<dl class="space-y-3 text-sm">
						<div class="flex justify-between gap-4">
							<dt class="text-muted-foreground">Organization</dt>
							<dd class="text-right font-medium">{selectedOrg?.name ?? '—'}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-muted-foreground">First label</dt>
							<dd class="font-mono">{sampleLabel}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-muted-foreground">Sheet size</dt>
							<dd>{pageWidthMm} × {pageHeightMm} mm</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-muted-foreground">Grid</dt>
							<dd>{columns} × {rows}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-muted-foreground">Total labels</dt>
							<dd>{totalLabels}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-muted-foreground">Pages</dt>
							<dd>{pageCount}</dd>
						</div>
					</dl>
				</Card.Content>
			</Card.Root>
		</aside>
	</div>
</div>
