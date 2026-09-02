<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { ConnectorFormModal } from '$lib/components/ui/connector-form-modal';
	import {
		createCableBatch,
		getCableVocabulary,
		getCategories,
		getLocations,
		getManufacturers
	} from '$lib/remote/assets.remote';
	import { getConnectors } from '$lib/remote/connectors.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import {
		CABLE_END_LABEL,
		cableDisplayName,
		connectorRole,
		counterpartConnector,
		isCable,
		endsAreReversed,
		parseCableQuickEntry,
		parseLengthMeters,
		type CableEndRole
	} from '$lib/cable';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { toast } from 'svelte-sonner';
	import { getErrorMessage, orgLabel, plural } from '$lib/utils';

	// ⌘ on a Mac, Ctrl everywhere else. Also keeps the symbol out of the
	// translation catalogue, where it has no business being.
	let modLabel = $derived(browser && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl');

	let saving = $state(false);
	let selectedOrgId = $state('');
	let locationId = $state('');
	let locations = $derived(selectedOrgId ? await getLocations(selectedOrgId) : []);

	$effect(() => {
		if (!selectedOrgId || locations.length === 0) {
			locationId = '';
			return;
		}
		if (!locationId || !locations.some((l) => l.id === locationId)) locationId = locations[0].id;
	});

	let categories = $derived(await getCategories());
	let manufacturers = $derived(await getManufacturers());
	let vocab = $derived(await getCableVocabulary());

	// Cables belong to nobody in particular, so the generic manufacturer is the
	// default. Before any exists there is nothing to name it with, and the server
	// creates it on the first save.
	let genericManufacturer = $derived(manufacturers.find((m) => m.generic) ?? null);
	let realManufacturers = $derived(manufacturers.filter((m) => !m.generic));

	let connectors = $derived(await getConnectors());
	let typeItems = $derived(vocab.types.map((name) => ({ id: name, name })));

	// The connector list arranged for the slot it fills — see ProductFields for
	// the reasoning. Per row, because each row carries its own department.
	function connectorOptions(categoryId: string, slot: CableEndRole) {
		const inputGender = categories.find((c) => c.id === categoryId)?.cableInputGender ?? null;
		const ranked = connectors.map((c) => {
			const role = connectorRole(c, connectors, inputGender);
			return {
				...c,
				hint: role ? CABLE_END_LABEL[role] : null,
				disabled: !!role && role !== slot,
				rank: role === slot ? 0 : role ? 2 : 1
			};
		});
		return ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'de'));
	}

	// Which row and side the create modal was opened from, so its result lands
	// back in the cell that asked for it. The rows are keyed by index, and the
	// modal is one instance for the whole grid.
	let creatingAt = $state<{ row: number; side: 'connectorA' | 'connectorB' } | null>(null);
	let creatingName = $state('');
	let connectorModalOpen = $state(false);

	function openConnectorModal(row: number, side: 'connectorA' | 'connectorB', name: string) {
		creatingAt = { row, side };
		creatingName = name;
		connectorModalOpen = true;
	}

	type Row = {
		cableType: string;
		connectorA: string;
		connectorB: string;
		lengthM: string;
		/** '' means the generic manufacturer — the server resolves it. */
		manufacturerId: string;
		categoryId: string;
		quantity: number;
		name: string;
		/** What `name` last held when it was derived rather than typed. */
		lastDerived: string;
	};

	// Untagged is the default: a sticker on a 1.5 m Schuko lead costs more to
	// maintain than the unit is worth. Remembered, because a pool that does tag
	// its cables tags all of them.
	let assignTags = $state(
		browser ? localStorage.getItem('cable_batch_assign_tags') === 'true' : false
	);
	$effect(() => {
		if (browser) localStorage.setItem('cable_batch_assign_tags', String(assignTags));
	});

	function newRow(from?: Row): Row {
		return {
			cableType: '',
			connectorA: '',
			connectorB: '',
			// Manufacturer, category and length carry down: a run of cable entry is
			// usually one drawer of one kind, and retyping "Power, 10 m" ten times
			// is what this form exists to avoid.
			lengthM: from?.lengthM ?? '',
			manufacturerId: from?.manufacturerId ?? '',
			categoryId: from?.categoryId ?? '',
			quantity: 1,
			name: '',
			lastDerived: ''
		};
	}

	let rows = $state<Row[]>([newRow()]);
	let gridEl: HTMLDivElement | undefined = $state();

	// The name is prefilled from type + length and then belongs to whoever typed
	// in it: as long as it still holds exactly what was last derived, it follows
	// along; the moment someone writes "Schuko → TRUE1 1,5 m" it is theirs.
	$effect(() => {
		for (const row of rows) {
			const derived = cableDisplayName(
				{
					cableType: row.cableType,
					connectorA: row.connectorA,
					connectorB: row.connectorB,
					lengthCm: parseLengthMeters(row.lengthM)
				},
				connectors
			);
			if (derived && (row.name === '' || row.name === row.lastDerived)) row.name = derived;
			row.lastDerived = derived;
		}
	});

	/**
	 * What this pool's newest cable of that type has. `byType` already falls back
	 * to the starter pairs for a type the catalogue has never seen, so there is
	 * one source here rather than two that can disagree.
	 */
	function applyTypeDefaults(row: Row, type: string) {
		row.cableType = type;
		// Emptying the field arrives here as '', and has to clear the cell rather
		// than be ignored — see the same handler in ProductFields.
		const precedent = type ? vocab.byType[type] : null;
		if (!precedent) return;
		if (!row.connectorA.trim() && precedent.connectorA) row.connectorA = precedent.connectorA;
		if (!row.connectorB.trim() && precedent.connectorB) row.connectorB = precedent.connectorB;
		if (!row.categoryId && precedent.categoryId) row.categoryId = precedent.categoryId;
	}

	// Same check the product form makes: the two ends are an ordered pair, and
	// "CEE32 → CEE16" is a different adapter from "CEE16 → CEE32".
	function rowReversed(row: Row) {
		const inputGender = categories.find((c) => c.id === row.categoryId)?.cableInputGender ?? null;
		return endsAreReversed(
			{ connectorA: row.connectorA, connectorB: row.connectorB },
			connectors,
			inputGender
		);
	}

	function swapEnds(row: Row) {
		const { connectorA, connectorB } = row;
		row.connectorA = connectorB;
		row.connectorB = connectorA;
	}

	// Picking a connector also answers which department the cable belongs to —
	// a Schuko plug is Power wherever it turns up. Only into an empty cell, so a
	// choice already made is never overridden.
	function setConnector(
		row: Row,
		side: 'connectorA' | 'connectorB',
		name: string,
		/** From a row just saved, whose catalogue refresh may not have landed yet. */
		categoryId?: string | null
	) {
		row[side] = name;

		// One end implies the other — see ProductFields for the reasoning.
		const far = side === 'connectorA' ? 'connectorB' : 'connectorA';
		if (name && !row[far].trim()) {
			const mate = counterpartConnector(name, connectors);
			if (mate) row[far] = mate.name;
		}

		if (row.categoryId) return;
		const department =
			categoryId ??
			connectors.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())?.categoryId;
		if (department) row.categoryId = department;
	}

	function addRow() {
		rows.push(newRow(rows[rows.length - 1]));
	}

	function removeRow(i: number) {
		rows.splice(i, 1);
		if (rows.length === 0) rows.push(newRow());
	}

	// ── Quick entry ───────────────────────────────────────────────────────────
	// The fastest way to describe a drawer of cables is the way a person says it
	// out loud. Everything it fills in is still an ordinary row afterwards.
	let quickEntry = $state('');

	function handleQuickEntry() {
		const parsed = parseCableQuickEntry(quickEntry);
		if (!parsed) {
			toast.error('Could not read that. Try "10x 10m Schuko".');
			return;
		}
		const row = newRow(rows[rows.length - 1]);
		row.quantity = parsed.quantity;
		row.lengthM = parsed.lengthCm ? String(parsed.lengthCm / 100).replace('.', ',') : '';
		applyTypeDefaults(row, parsed.cableType);
		// A blank first row is a placeholder, not an entry someone made.
		if (rows.length === 1 && !rows[0].cableType.trim()) rows[0] = row;
		else rows.push(row);
		quickEntry = '';
	}

	/**
	 * Enter anywhere in the last row's plain inputs adds another one and moves
	 * into it. The type and connector pickers are excluded — Enter is how they
	 * accept a suggestion.
	 */
	function handleGridKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.metaKey || e.ctrlKey) return;
		const target = e.target as HTMLElement;
		if (target.closest('[data-picker]')) return;
		const row = target.closest('[data-row]') as HTMLElement | null;
		if (!row || row.dataset.row !== String(rows.length - 1)) return;
		e.preventDefault();
		addRow();
		queueMicrotask(() => {
			const next = gridEl?.querySelector<HTMLInputElement>(`[data-row="${rows.length - 1}"] input`);
			next?.focus();
		});
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (saving) return;
		if (!locationId) {
			toast.error('Please select a location');
			return;
		}
		// A row counts when it says *something* about the cable. The type is only
		// the wire spec now, and most cables have nothing to put there.
		const filled = rows.filter((r) =>
			isCable({
				cableType: r.cableType.trim() || null,
				connectorA: r.connectorA.trim() || null,
				connectorB: r.connectorB.trim() || null,
				lengthCm: parseLengthMeters(r.lengthM)
			})
		);
		if (filled.length === 0) {
			toast.error('Add at least one cable');
			return;
		}
		if (filled.some((r) => !r.categoryId)) {
			toast.error('Every row needs a category');
			return;
		}

		saving = true;
		try {
			const result = await createCableBatch({
				organizationId: selectedOrgId,
				locationId,
				assignAssetTags: assignTags,
				rows: filled.map((r) => ({
					cableType: r.cableType.trim() || null,
					connectorA: r.connectorA.trim() || null,
					connectorB: r.connectorB.trim() || null,
					lengthCm: parseLengthMeters(r.lengthM),
					manufacturerId: r.manufacturerId || null,
					categoryId: r.categoryId,
					name:
						r.name.trim() ||
						cableDisplayName(
							{
								cableType: r.cableType,
								connectorA: r.connectorA,
								connectorB: r.connectorB,
								lengthCm: parseLengthMeters(r.lengthM)
							},
							connectors
						),
					quantity: r.quantity
				}))
			});

			const products = new Set(result.rows.map((r) => r.productId)).size;
			const newProducts = new Set(
				result.rows.filter((r) => r.productCreated).map((r) => r.productId)
			).size;
			// Whether a row reused a catalogue entry or made one is the thing worth
			// reporting: it is how you find out you have just spelled "Schuko" a
			// second way.
			const parts = [
				plural(result.created, ['# cable created', '# cables created']),
				plural(products, ['# product', '# products'])
			];
			if (newProducts > 0) {
				parts.push(plural(newProducts, ['# new catalog entry', '# new catalog entries']));
			}
			toast.success(parts.join(' · '));
			// Batch entry is inherently "and another": the form resets and stays put.
			rows = [newRow(filled[filled.length - 1])];
			quickEntry = '';
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Add Cables | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Add Cables</h1>
		<p class="text-muted-foreground">
			A drawer at a time. Identical cables share one catalog entry, so the list stays "10 × Schuko
			10 m" rather than ten rows.
		</p>
	</div>

	<!-- The card clips to its rounded corners by default, which cuts off any
	     picker that opens past its bottom edge — and on this form the connector
	     and category pickers sit on the last row. Nothing here is an image, so
	     there is nothing left for the clipping to do. -->
	<Card.Root class="overflow-visible">
		<Card.Content class="pt-6">
			{#if true}
				{@const orgs = await getMyOrgs()}
				{#if !selectedOrgId && orgs[0]}{((selectedOrgId = orgs[0].id), '')}{/if}
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="org">Organization</Label>
							<select
								id="org"
								bind:value={selectedOrgId}
								required
								class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
							>
								{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
							</select>
						</div>

						<div class="space-y-2">
							<Label for="location">Location</Label>
							<select
								id="location"
								bind:value={locationId}
								required
								class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
							>
								{#if locations.length === 0}
									<option value="" disabled>—</option>
								{:else}
									{#each locations as loc (loc.id)}<option value={loc.id}>{loc.name}</option>{/each}
								{/if}
							</select>
							{#if selectedOrgId && locations.length === 0}
								<p class="text-sm text-muted-foreground">
									No locations yet. Create one in
									<a class="underline" href={resolve(`/orgs/${selectedOrgId}/locations`)}
										>Locations</a
									>.
								</p>
							{/if}
						</div>
					</div>

					<div class="space-y-2">
						<Label for="quick">Quick entry</Label>
						<Input
							id="quick"
							bind:value={quickEntry}
							placeholder="10x 10m Schuko"
							onkeydown={(e) => {
								if (e.key !== 'Enter') return;
								e.preventDefault();
								handleQuickEntry();
							}}
						/>
						<p class="text-sm text-muted-foreground">
							Type it the way you'd say it and press Enter. Everything it fills in is still editable
							below.
						</p>
					</div>

					<!-- The row grid deliberately has no scroll container. `overflow-x: auto`
					     forces `overflow-y: auto` too, which clips every popover inside it —
					     the category and connector pickers would open into a cut-off box.
					     So the columns wrap on a narrow screen instead, and each cell
					     carries its own label until the header row appears. -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div bind:this={gridEl} onkeydown={handleGridKeydown} class="rounded-lg border">
						<div
							class="hidden gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground xl:grid xl:grid-cols-[9rem_9rem_5rem_10rem_10rem_11rem_4.5rem_1fr_2.5rem]"
						>
							<!-- A is the end that feeds and B the end that is fed, the same
							     convention the product form states on its labels. Shown flat here
							     rather than per department, because one header serves rows that
							     may each sit in a different one. -->
							<span
								>Connector A <span class="ml-1 font-mono text-[10px] normal-case"
									>{CABLE_END_LABEL.in}</span
								></span
							>
							<span
								>Connector B <span class="ml-1 font-mono text-[10px] normal-case"
									>{CABLE_END_LABEL.out}</span
								></span
							>
							<span>Length (m)</span>
							<span>Additional info</span>
							<span>Manufacturer</span>
							<span>Category</span>
							<span>Qty</span>
							<span>Name</span>
							<span></span>
						</div>
						{#each rows as row, i (i)}
							<div
								data-row={i}
								class="grid grid-cols-2 gap-3 border-b p-3 last:border-0 sm:grid-cols-4 xl:grid-cols-[9rem_9rem_5rem_10rem_10rem_11rem_4.5rem_1fr_2.5rem] xl:items-center xl:gap-2 xl:px-3 xl:py-2"
							>
								<div class="space-y-1" data-picker>
									<span class="text-xs text-muted-foreground xl:hidden"
										>Connector A <span class="font-mono">{CABLE_END_LABEL.in}</span></span
									>
									<CreatableSelect
										items={connectorOptions(row.categoryId, 'in')}
										value={row.connectorA ? { id: row.connectorA, name: row.connectorA } : null}
										onchange={(sel) => setConnector(row, 'connectorA', sel?.name ?? '')}
										oncreate={(name) => openConnectorModal(i, 'connectorA', name)}
										showImages
										placeholder="A…"
									/>
								</div>
								<div class="space-y-1" data-picker>
									<span class="text-xs text-muted-foreground xl:hidden"
										>Connector B <span class="font-mono">{CABLE_END_LABEL.out}</span></span
									>
									<CreatableSelect
										items={connectorOptions(row.categoryId, 'out')}
										value={row.connectorB ? { id: row.connectorB, name: row.connectorB } : null}
										onchange={(sel) => setConnector(row, 'connectorB', sel?.name ?? '')}
										oncreate={(name) => openConnectorModal(i, 'connectorB', name)}
										showImages
										placeholder="B…"
									/>
								</div>
								<div class="space-y-1">
									<span class="text-xs text-muted-foreground xl:hidden">Length (m)</span>
									<Input inputmode="decimal" placeholder="10" bind:value={row.lengthM} />
								</div>
								<div class="space-y-1" data-picker>
									<span class="text-xs text-muted-foreground xl:hidden">Additional info</span>
									<CreatableSelect
										items={typeItems}
										value={row.cableType ? { id: row.cableType, name: row.cableType } : null}
										onchange={(sel) => applyTypeDefaults(row, sel?.name ?? '')}
										oncreate={(name) => applyTypeDefaults(row, name)}
										placeholder="CAT7, 2.5mm²…"
									/>
								</div>
								<div class="space-y-1">
									<span class="text-xs text-muted-foreground xl:hidden">Manufacturer</span>
									<select
										bind:value={row.manufacturerId}
										class="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
									>
										<option value=""
											>{genericManufacturer?.name ?? 'Generic (created on save)'}</option
										>
										{#each realManufacturers as m (m.id)}<option value={m.id}>{m.name}</option
											>{/each}
									</select>
								</div>
								<div class="space-y-1">
									<span class="text-xs text-muted-foreground xl:hidden">Category</span>
									<CategorySelect {categories} bind:value={row.categoryId} />
								</div>
								<div class="space-y-1">
									<span class="text-xs text-muted-foreground xl:hidden">Qty</span>
									<Input type="number" min="1" max="200" bind:value={row.quantity} />
								</div>
								<div class="space-y-1">
									<span class="text-xs text-muted-foreground xl:hidden">Name</span>
									<Input bind:value={row.name} placeholder={row.lastDerived || 'Schuko 10 m'} />
								</div>
								<div class="flex items-end justify-end xl:items-center">
									<button
										type="button"
										onclick={() => removeRow(i)}
										title="Remove row"
										class="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="15"
											height="15"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<path d="M18 6 6 18M6 6l12 12" />
										</svg>
									</button>
								</div>

								{#if rowReversed(row)}
									<div
										class="col-span-2 flex flex-wrap items-center gap-x-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs sm:col-span-4 xl:col-span-9"
									>
										<span>Ends look reversed — A should be the end that goes into the supply.</span>
										<button
											type="button"
											onclick={() => swapEnds(row)}
											class="font-medium underline underline-offset-2">Swap the ends</button
										>
									</div>
								{/if}
							</div>
						{/each}
					</div>

					<Button icon="add" type="button" variant="outline" onclick={addRow}>Add row</Button>

					<div class="flex flex-col gap-4 pt-2">
						<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
							<input
								type="checkbox"
								bind:checked={assignTags}
								class="h-4 w-4 rounded border-input"
							/>
							Assign asset tags
						</label>
						<div class="flex items-center justify-end gap-4">
							<span class="mr-auto text-xs text-muted-foreground">{modLabel} + Enter saves</span>
							<Button icon="close" type="button" variant="outline" href={resolve('/assets')}
								>Done</Button
							>
							<Button icon="add" type="submit" disabled={saving}>
								{saving ? 'Saving…' : 'Add Cables'}
							</Button>
						</div>
					</div>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<ConnectorFormModal
	bind:open={connectorModalOpen}
	initialName={creatingName}
	onSaved={(saved) => {
		if (creatingAt && rows[creatingAt.row]) {
			setConnector(rows[creatingAt.row], creatingAt.side, saved.name, saved.categoryId);
		}
		creatingAt = null;
	}}
/>

<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e);
	}}
/>
