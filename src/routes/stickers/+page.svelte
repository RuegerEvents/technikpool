<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { toast } from 'svelte-sonner';

	const orgs = await getMyOrgs();

	let selectedOrgId = $state(orgs[0]?.id ?? '');
	let type = $state<'quadratisch' | 'faehnchen'>('quadratisch');
	let color = $state('#0069c9');
	let brandText = $state(orgs[0]?.name ?? '');
	let logoText = $state('RE');
	let from = $state(1);
	let to = $state(150);
	let copies = $state(1);
	let payloadTemplate = $state('{label}');
	let labelPrefix = $state(orgs[0]?.assetIdPrefix ?? 'RE');
	let padLength = $state(5);
	let showCutLines = $state(false);
	let advanced = $state(false);
	const payloadPlaceholder = 'https://technik.example/assets/{label}';
	const heroPreviewCells = Array.from({ length: 20 }, (_value, index) => index);
	const matrixPreviewCells = Array.from({ length: 25 }, (_value, index) => index);
	let generating = $state(false);

	let pageWidthMm = $state(303);
	let pageHeightMm = $state(216);
	let widthMm = $state(15);
	let heightMm = $state(15);
	let flagTailMm = $state(12);
	let columns = $state(15);
	let rows = $state(10);
	let marginLeftMm = $state(6);
	let marginTopMm = $state(13);
	let gapXMm = $state(3.5);
	let gapYMm = $state(3.5);
	let matrixScale = $state(0.68);
	let quietZoneMm = $state(1.1);

	let selectedOrg = $derived(orgs.find((org) => org.id === selectedOrgId));
	let totalLabels = $derived(Math.max(0, to - from + 1) * copies);
	let labelsPerPage = $derived(columns * rows);
	let pageCount = $derived(Math.max(1, Math.ceil(totalLabels / labelsPerPage)));
	let sampleLabel = $derived(`${labelPrefix}${String(from).padStart(padLength, '0')}`);
	let samplePayload = $derived(
		payloadTemplate.replaceAll('{label}', sampleLabel).replaceAll('{number}', String(from))
	);

	function applyTypeDefaults(nextType: 'quadratisch' | 'faehnchen') {
		type = nextType;
		if (nextType === 'quadratisch') {
			widthMm = 15;
			heightMm = 15;
			columns = 15;
			rows = 10;
			marginLeftMm = 6;
			marginTopMm = 13;
			gapXMm = 3.5;
			gapYMm = 3.5;
		} else {
			widthMm = 28;
			heightMm = 15;
			flagTailMm = 12;
			columns = 5;
			rows = 6;
			marginLeftMm = 8;
			marginTopMm = 16;
			gapXMm = 10;
			gapYMm = 8;
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
					size: { widthMm, heightMm, flagTailMm: type === 'faehnchen' ? flagTailMm : undefined },
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
					showCutLines
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
	<section class="overflow-hidden rounded-3xl border bg-background shadow-sm">
		<div class="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
			<div class="space-y-5 p-6 md:p-8">
				<div
					class="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground"
				>
					<span class="h-2 w-2 rounded-full" style:background-color={color}></span>
					Print-ready PDF generator
				</div>
				<div class="space-y-3">
					<h1 class="text-3xl font-bold tracking-tight md:text-4xl">Sticker sheets</h1>
					<p class="max-w-2xl text-muted-foreground">
						Generate Data Matrix sticker sheets for Technikpool asset tags, with presets for
						wir-machen-druck.de square stickers and flag labels.
					</p>
				</div>
				<div class="grid gap-3 sm:grid-cols-3">
					<div class="rounded-2xl border bg-muted/30 p-4">
						<p class="text-xs font-medium text-muted-foreground">Labels</p>
						<p class="mt-1 text-2xl font-semibold tabular-nums">{totalLabels}</p>
					</div>
					<div class="rounded-2xl border bg-muted/30 p-4">
						<p class="text-xs font-medium text-muted-foreground">Per page</p>
						<p class="mt-1 text-2xl font-semibold tabular-nums">{labelsPerPage}</p>
					</div>
					<div class="rounded-2xl border bg-muted/30 p-4">
						<p class="text-xs font-medium text-muted-foreground">Pages</p>
						<p class="mt-1 text-2xl font-semibold tabular-nums">{pageCount}</p>
					</div>
				</div>
			</div>

			<div
				class="relative min-h-72 border-t bg-gradient-to-br from-sky-50 via-blue-50 to-zinc-100 p-6 lg:border-t-0 lg:border-l dark:from-sky-950/40 dark:via-blue-950/20 dark:to-zinc-900"
			>
				<div
					class="absolute inset-6 rounded-[2rem] border border-white/70 bg-white/70 shadow-xl backdrop-blur dark:border-white/10 dark:bg-zinc-950/60"
				></div>
				<div class="relative mx-auto flex h-full max-w-sm items-center justify-center py-6">
					<div
						class="grid rotate-[-3deg] grid-cols-5 gap-2 rounded-xl bg-white p-4 shadow-2xl dark:bg-zinc-900"
					>
						{#each heroPreviewCells as i (i)}
							<div
								class="relative h-10 w-10 overflow-hidden rounded-md shadow-sm ring-1 ring-black/10"
								style:background-color={color}
							>
								<div class="absolute top-1 left-1 h-5 w-5 rounded-sm bg-white"></div>
								<div class="absolute bottom-1 left-1 h-1 w-5 rounded bg-white/90"></div>
								<div class="absolute right-1 bottom-1 text-[6px] font-bold text-white">
									{logoText || i + 1}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</section>

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
								<Input bind:value={color} pattern="^#[0-9a-fA-F]{6}$" class="font-mono" />
							</div>
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
									<Label>Sticker width mm</Label><Input
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
								{#if type === 'faehnchen'}<div class="space-y-2">
										<Label>Flag tail mm</Label><Input
											type="number"
											step="0.1"
											bind:value={flagTailMm}
										/>
									</div>{/if}
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
								<label class="flex items-center gap-2 text-sm md:col-span-2"
									><input
										type="checkbox"
										bind:checked={showCutLines}
										class="h-4 w-4 rounded border-input"
									/> Show cut line overlay</label
								>
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
					</dl>
				</Card.Content>
			</Card.Root>
		</aside>
	</div>
</div>
