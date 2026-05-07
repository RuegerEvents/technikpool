<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { getLocations, getCategories, importAssets } from '$lib/remote/assets.remote';
	import type { ImportResult } from '$lib/remote/assets.remote';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';

	type Props = { onClose: () => void };
	let { onClose }: Props = $props();

	type Step = 'upload' | 'mapping' | 'importing' | 'results';
	let step = $state<Step>('upload');

	// CSV state
	let csvHeaders = $state<string[]>([]);
	let csvRows = $state<string[][]>([]);
	let dragOver = $state(false);
	let fileInput = $state<HTMLInputElement>();

	// Org + location
	let selectedOrgId = $state('');
	let selectedLocationId = $state('');
	let locations = $derived(selectedOrgId ? await getLocations(selectedOrgId) : []);
	let categories = $derived(await getCategories());

	$effect(() => {
		if (!selectedOrgId) {
			selectedLocationId = '';
			return;
		}
		if (locations.length === 0) {
			selectedLocationId = '';
			return;
		}
		if (!selectedLocationId || !locations.some((l) => l.id === selectedLocationId)) {
			selectedLocationId = locations[0].id;
		}
	});

	// Column mapping
	type FieldType = 'skip' | 'manufacturer' | 'product' | 'category' | 'serialNumber' | 'assetTag';
	let columnMapping = $state<FieldType[]>([]);

	// Category CSV value → DB categoryId
	let categoryValueMap = $state<Record<string, string>>({});

	let categoryColIdx = $derived(columnMapping.indexOf('category' as FieldType));

	let uniqueCategoryValues = $derived.by(() => {
		if (categoryColIdx < 0) return [] as string[];
		const vals = new SvelteSet<string>();
		for (const row of csvRows) {
			const v = row[categoryColIdx]?.trim();
			if (v) vals.add(v);
		}
		return [...vals].sort();
	});

	$effect(() => {
		const vals = uniqueCategoryValues;
		const cats = categories;
		for (const val of vals) {
			if (categoryValueMap[val]) continue;
			const match = autoMatch(val, cats);
			if (match) categoryValueMap[val] = match;
		}
	});

	// Results
	let importResult = $state<ImportResult | null>(null);

	// ── CSV parsing ─────────────────────────────────────────────────────────────

	function detectSep(line: string): string {
		const tab = (line.match(/\t/g) || []).length;
		const semi = (line.match(/;/g) || []).length;
		const comma = (line.match(/,/g) || []).length;
		if (tab > comma && tab > semi) return '\t';
		if (semi > comma) return ';';
		return ',';
	}

	function parseLine(line: string, sep: string): string[] {
		const fields: string[] = [];
		let field = '';
		let q = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (c === '"') {
				if (q && line[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					q = !q;
				}
			} else if (c === sep && !q) {
				fields.push(field.trim());
				field = '';
			} else {
				field += c;
			}
		}
		fields.push(field.trim());
		return fields;
	}

	function parseCsv(text: string): { headers: string[]; rows: string[][] } {
		if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
		const lines = text.split(/\r?\n/).filter((l) => l.trim());
		if (!lines.length) return { headers: [], rows: [] };
		const sep = detectSep(lines[0]);
		return {
			headers: parseLine(lines[0], sep),
			rows: lines.slice(1).map((l) => parseLine(l, sep))
		};
	}

	// ── Auto-detection ───────────────────────────────────────────────────────────

	function autoDetect(headers: string[]): FieldType[] {
		return headers.map((h) => {
			const n = h.toLowerCase().replace(/[\s_./-]/g, '');
			// Manufacturer — EN + DE (Hersteller)
			if (
				n.includes('manufacturer') ||
				n.includes('brand') ||
				n.includes('make') ||
				n === 'mfr' ||
				n === 'hersteller'
			)
				return 'manufacturer';
			// Product / Model — EN + DE (Bezeichnung = designation/name)
			if (
				n.includes('product') ||
				n.includes('model') ||
				n.includes('article') ||
				n === 'name' ||
				n.includes('bezeich')
			)
				return 'product';
			// Category — EN + DE (Kategorie)
			if (
				n.includes('category') ||
				n.includes('type') ||
				n.includes('class') ||
				n === 'cat' ||
				n.includes('kateg')
			)
				return 'category';
			// Serial Number — EN + DE (Seriennummer)
			if (n.includes('serial') || n === 'sn' || n === 'serialno' || n.includes('serienr'))
				return 'serialNumber';
			// Asset Tag / ID — the unique asset identifier
			if (
				n === 'id' ||
				n === 'assetid' ||
				n.includes('assetnr') ||
				n.includes('inventarnr') ||
				n.includes('inventarno') ||
				n.includes('tag') ||
				n.includes('assetnumber') ||
				n.includes('assetno')
			)
				return 'assetTag';
			return 'skip';
		});
	}

	// DE ↔ EN synonyms for common equipment categories
	const categorySynonyms: Record<string, string[]> = {
		licht: ['light', 'lighting', 'beleuchtung'],
		light: ['licht', 'lighting', 'beleuchtung'],
		lighting: ['licht', 'light'],
		netzwerk: ['network', 'networking'],
		network: ['netzwerk', 'networking'],
		strom: ['power', 'electrical', 'electricity', 'energie'],
		power: ['strom', 'electrical', 'energie'],
		sonstiges: ['miscellaneous', 'misc', 'other', 'diverses', 'andere'],
		miscellaneous: ['sonstiges', 'other', 'misc'],
		other: ['sonstiges', 'diverses', 'andere']
	};

	function autoMatch(val: string, cats: typeof categories): string | null {
		const n = val.toLowerCase().replace(/[^a-z0-9]/g, '');
		// 1. Exact match
		for (const c of cats) {
			if (c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === n) return c.id;
		}
		// 2. Synonym match (DE ↔ EN)
		const synonyms = categorySynonyms[n] ?? [];
		for (const syn of synonyms) {
			for (const c of cats) {
				if (c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === syn) return c.id;
			}
		}
		// 3. Substring fallback (only when n is long enough to avoid false positives)
		if (n.length >= 4) {
			for (const c of cats) {
				const cn = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
				if (cn.includes(n) || n.includes(cn)) return c.id;
			}
		}
		return null;
	}

	// ── File handling ────────────────────────────────────────────────────────────

	async function handleFile(file: File) {
		const text = await file.text();
		const { headers, rows } = parseCsv(text);
		if (!headers.length) {
			toast.error('Could not parse CSV file');
			return;
		}
		csvHeaders = headers;
		csvRows = rows;
		columnMapping = autoDetect(headers);
		categoryValueMap = {};
		step = 'mapping';
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) handleFile(file);
	}

	function handleFileInput(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) handleFile(file);
	}

	// ── Import ───────────────────────────────────────────────────────────────────

	let canImport = $derived(
		!!selectedOrgId &&
			!!selectedLocationId &&
			columnMapping.includes('manufacturer' as FieldType) &&
			columnMapping.includes('product' as FieldType) &&
			csvRows.length > 0
	);

	async function runImport() {
		if (categoryColIdx >= 0) {
			const unmapped = uniqueCategoryValues.filter((v) => !categoryValueMap[v]);
			if (unmapped.length > 0) {
				toast.error(`Please map all category values: ${unmapped.join(', ')}`);
				return;
			}
		}
		step = 'importing';
		try {
			const mfIdx = columnMapping.indexOf('manufacturer' as FieldType);
			const prIdx = columnMapping.indexOf('product' as FieldType);
			const snIdx = columnMapping.indexOf('serialNumber' as FieldType);
			const tgIdx = columnMapping.indexOf('assetTag' as FieldType);
			const catIdx = categoryColIdx;

			const rows = csvRows.flatMap((row) => {
				const mf = mfIdx >= 0 ? row[mfIdx]?.trim() : '';
				const pr = prIdx >= 0 ? row[prIdx]?.trim() : '';
				if (!mf || !pr) return [];
				const csvCat = catIdx >= 0 ? row[catIdx]?.trim() : '';
				return [
					{
						manufacturerName: mf,
						productName: pr,
						categoryId: csvCat ? categoryValueMap[csvCat] : undefined,
						serialNumber: snIdx >= 0 ? row[snIdx]?.trim() || undefined : undefined,
						assetTag: tgIdx >= 0 ? row[tgIdx]?.trim() || undefined : undefined
					}
				];
			});

			importResult = await importAssets({
				organizationId: selectedOrgId,
				locationId: selectedLocationId,
				rows
			});
			step = 'results';
		} catch (err) {
			toast.error((err as Error).message);
			step = 'mapping';
		}
	}

	const fieldOptions: { value: FieldType; label: string }[] = [
		{ value: 'skip', label: 'Skip' },
		{ value: 'manufacturer', label: 'Manufacturer' },
		{ value: 'product', label: 'Product / Model' },
		{ value: 'category', label: 'Category' },
		{ value: 'serialNumber', label: 'Serial Number' },
		{ value: 'assetTag', label: 'Asset Tag' }
	];

	let previewRows = $derived(csvRows.slice(0, 5));

	const stepTitles: Record<Step, string> = {
		upload: 'Import Assets from CSV',
		mapping: 'Configure Import',
		importing: 'Importing…',
		results: 'Import Complete'
	};

	const selectClass =
		'flex h-9 w-full items-center rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none';
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
>
	<!-- Modal card -->
	<div
		class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
		role="dialog"
		aria-modal="true"
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b px-6 py-4">
			<h2 class="text-lg font-semibold">{stepTitles[step]}</h2>
			<button
				type="button"
				onclick={onClose}
				class="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
				aria-label="Close"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M18 6 6 18" /><path d="m6 6 12 12" />
				</svg>
			</button>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto px-6 py-5">
			<!-- Step 1: Upload -->
			{#if step === 'upload'}
				<div
					ondrop={handleDrop}
					ondragover={(e) => {
						e.preventDefault();
						dragOver = true;
					}}
					ondragleave={() => (dragOver = false)}
					onclick={() => fileInput?.click()}
					role="button"
					tabindex="0"
					onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
					class="flex cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-8 py-16 transition-colors {dragOver
						? 'border-primary bg-primary/5'
						: 'border-border hover:border-primary/50 hover:bg-muted/30'}"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="40"
						height="40"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-muted-foreground"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="17 8 12 3 7 8" />
						<line x1="12" x2="12" y1="3" y2="15" />
					</svg>
					<div class="text-center">
						<p class="text-sm font-medium">
							Drag and drop a CSV file here, or <span class="text-primary">click to browse</span>
						</p>
						<p class="mt-1 text-xs text-muted-foreground">
							Supported: .csv files with column headers
						</p>
					</div>
				</div>
				<input
					type="file"
					accept=".csv,text/csv"
					class="hidden"
					bind:this={fileInput}
					onchange={handleFileInput}
				/>
			{/if}

			<!-- Step 2: Mapping -->
			{#if step === 'mapping'}
				{#if true}
					{@const orgs = await getMyOrgs()}
					{#if !selectedOrgId && orgs[0]}{((selectedOrgId = orgs[0].id), '')}{/if}

					<div class="space-y-6">
						<!-- Org + Location -->
						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-1.5">
								<label class="text-sm font-medium" for="import-org">Organization</label>
								<select id="import-org" bind:value={selectedOrgId} class={selectClass}>
									{#each orgs as org (org.id)}
										<option value={org.id}>{org.name}</option>
									{/each}
								</select>
							</div>
							<div class="space-y-1.5">
								<label class="text-sm font-medium" for="import-loc">Location</label>
								<select
									id="import-loc"
									bind:value={selectedLocationId}
									disabled={locations.length === 0}
									class={selectClass}
								>
									{#if locations.length === 0}
										<option value="">No locations</option>
									{:else}
										{#each locations as loc (loc.id)}
											<option value={loc.id}>{loc.name}</option>
										{/each}
									{/if}
								</select>
							</div>
						</div>

						<!-- Column mapping -->
						<div class="space-y-2">
							<h3 class="text-sm font-medium">Column Mapping</h3>
							<div class="overflow-hidden rounded-lg border">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b bg-muted/30">
											<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground"
												>CSV Column</th
											>
											<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground"
												>Maps To</th
											>
											<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground"
												>Sample</th
											>
										</tr>
									</thead>
									<tbody>
										{#each csvHeaders as header, i (i)}
											<tr class="border-b last:border-0">
												<td class="px-4 py-2 font-mono text-xs">{header}</td>
												<td class="px-4 py-2">
													<select
														bind:value={columnMapping[i]}
														class="h-8 rounded border border-input bg-background px-2 text-xs focus:ring-1 focus:ring-ring focus:outline-none"
													>
														{#each fieldOptions as opt (opt.value)}
															<option value={opt.value}>{opt.label}</option>
														{/each}
													</select>
												</td>
												<td
													class="max-w-[180px] truncate px-4 py-2 font-mono text-xs text-muted-foreground"
												>
													{csvRows[0]?.[i] ?? ''}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>

						<!-- Category value mapping -->
						{#if categoryColIdx >= 0 && uniqueCategoryValues.length > 0}
							<div class="space-y-2">
								<h3 class="text-sm font-medium">Category Values</h3>
								<div class="overflow-hidden rounded-lg border">
									<table class="w-full text-sm">
										<thead>
											<tr class="border-b bg-muted/30">
												<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground"
													>Value in CSV</th
												>
												<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground"
													>Maps To Category</th
												>
											</tr>
										</thead>
										<tbody>
											{#each uniqueCategoryValues as val (val)}
												<tr class="border-b last:border-0">
													<td class="px-4 py-2 font-mono text-xs">{val}</td>
													<td class="px-4 py-2">
														<select
															bind:value={categoryValueMap[val]}
															class="h-8 w-full rounded border border-input bg-background px-2 text-xs focus:ring-1 focus:ring-ring focus:outline-none"
														>
															<option value="">— Unassigned —</option>
															{#each categories as cat (cat.id)}
																<option value={cat.id}>{cat.name}</option>
															{/each}
														</select>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						{/if}

						<!-- Preview -->
						{#if previewRows.length > 0}
							<div class="space-y-2">
								<h3 class="text-sm font-medium">
									Preview <span class="font-normal text-muted-foreground"
										>(first {previewRows.length} of {csvRows.length} rows)</span
									>
								</h3>
								<div class="overflow-x-auto rounded-lg border">
									<table class="w-full text-xs">
										<thead>
											<tr class="border-b bg-muted/30">
												{#each csvHeaders as h, i (i)}
													{#if columnMapping[i] !== 'skip'}
														<th class="px-3 py-2 text-left font-medium text-muted-foreground"
															>{h}</th
														>
													{/if}
												{/each}
											</tr>
										</thead>
										<tbody>
											{#each previewRows as row, ri (ri)}
												<tr class="border-b last:border-0">
													{#each row as cell, ci (ci)}
														{#if columnMapping[ci] !== 'skip'}
															<td class="max-w-[160px] truncate px-3 py-2">{cell ?? ''}</td>
														{/if}
													{/each}
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			{/if}

			<!-- Step 3: Importing -->
			{#if step === 'importing'}
				<div class="flex flex-col items-center justify-center gap-4 py-16">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="animate-spin text-muted-foreground"
					>
						<path d="M21 12a9 9 0 1 1-6.219-8.56" />
					</svg>
					<p class="text-sm text-muted-foreground">Processing {csvRows.length} rows…</p>
				</div>
			{/if}

			<!-- Step 4: Results -->
			{#if step === 'results' && importResult}
				<div class="space-y-5">
					<div class="grid grid-cols-3 gap-4">
						<div class="rounded-lg border p-4 text-center">
							<div class="text-2xl font-bold text-green-600 dark:text-green-400">
								{importResult.created}
							</div>
							<div class="mt-1 text-xs text-muted-foreground">Assets created</div>
						</div>
						<div class="rounded-lg border p-4 text-center">
							<div
								class="text-2xl font-bold {importResult.skipped > 0
									? 'text-yellow-600 dark:text-yellow-400'
									: 'text-muted-foreground'}"
							>
								{importResult.skipped}
							</div>
							<div class="mt-1 text-xs text-muted-foreground">Assets skipped (existing tag)</div>
						</div>
						<div class="rounded-lg border p-4 text-center">
							<div
								class="text-2xl font-bold {importResult.errors.length > 0
									? 'text-red-600 dark:text-red-400'
									: 'text-muted-foreground'}"
							>
								{importResult.errors.length}
							</div>
							<div class="mt-1 text-xs text-muted-foreground">Errors</div>
						</div>
					</div>
					{#if importResult.errors.length > 0}
						<div class="space-y-1.5">
							<h3 class="text-sm font-medium">Error details</h3>
							<div class="max-h-48 overflow-y-auto rounded-lg border text-xs">
								{#each importResult.errors as err (err.rowIndex)}
									<div class="border-b px-4 py-2 last:border-0">
										<span class="text-muted-foreground">Row {err.rowIndex + 2}:</span>
										{err.message}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<div class="flex items-center justify-between border-t px-6 py-4">
			{#if step === 'upload'}
				<div></div>
				<Button variant="outline" onclick={onClose}>Cancel</Button>
			{:else if step === 'mapping'}
				<Button variant="outline" onclick={() => (step = 'upload')}>Back</Button>
				<div class="flex items-center gap-3">
					<span class="text-sm text-muted-foreground">{csvRows.length} rows</span>
					<Button onclick={runImport} disabled={!canImport}>Import</Button>
				</div>
			{:else if step === 'importing'}
				<div></div>
				<div></div>
			{:else if step === 'results'}
				<div></div>
				<Button onclick={onClose}>Close</Button>
			{/if}
		</div>
	</div>
</div>
