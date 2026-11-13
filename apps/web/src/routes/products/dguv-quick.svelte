<script lang="ts">
	import { EQUIPMENT_VIEWS } from '#lib/equipment-views.js';
	import { matchesSearch } from '#lib/search.js';
	// The inspection quick mode of /products: the whole catalog as one table,
	// filtered by category and by whether a product needs one inspection type, so
	// the answer can be given for a shelf of products at once instead of one
	// product page at a time. The rule itself is `requiresInspection` — per type,
	// the product's own answer, else its category's.
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { CategoryPill } from '#lib/components/ui/category-pill/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import { categoryLabel } from '#lib/category.js';
	import { productLabel } from '#lib/product-label.js';
	import {
		INSPECTION_TYPE_IDS,
		inspectionOverride,
		requiresInspection as requires
	} from '#lib/inspection-due.js';
	import { inspectionTypeLabel } from '#lib/inspection-ui.svelte.js';
	import { naturalCompare } from '#lib/sort.js';
	import { confirmAction } from '#lib/confirm.svelte.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import {
		getInspectionTypes,
		getMainsConnectorsByProduct,
		setProductsInspectionRequirement
	} from '#lib/remote/inspections.remote.js';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import { Zap } from '@lucide/svelte';

	type Product = {
		id: string;
		name: string;
		isLicense: boolean;
		inspectionTypes: { typeId: string; required: boolean }[];
		imagePath: string | null;
		assetCount: number;
		manufacturer: { name: string } | null;
		category: {
			id: string;
			name: string;
			nameDe: string | null;
			color: string;
			inspectionTypes: { typeId: string }[];
		};
	};

	type Props = {
		products: Product[];
		categories: { id: string; name: string; nameDe: string | null }[];
		ready: boolean;
		error?: unknown;
	};

	let { products, categories, ready, error }: Props = $props();

	let mainsQuery = $derived(getMainsConnectorsByProduct());
	let mains = $derived(mainsQuery.current ?? {});
	let typesQuery = $derived(getInspectionTypes());
	let types = $derived(typesQuery.current ?? []);

	// Every answer on this screen is about one type at a time.
	let typeId = $state<string>(INSPECTION_TYPE_IDS.electrical);
	let electrical = $derived(typeId === INSPECTION_TYPE_IDS.electrical);
	const requiresInspection = (p: Product) => requires(p, typeId);
	const byCategory = (p: Product) => p.category.inspectionTypes.some((t) => t.typeId === typeId);

	type Status = 'all' | 'required' | 'not_required' | 'mains_unmarked';
	let categoryId = $state('');
	let status = $state<Status>('all');
	let search = $state('');
	let selected = new SvelteSet<string>();
	let saving = $state(false);

	// Licences are software: never inspected, so never listed here.
	let inspectable = $derived(products.filter((p) => !p.isLicense));
	let searchTrimmed = $derived(search.toLowerCase().trim());
	let rows = $derived(
		inspectable
			.filter((p) => !categoryId || p.category.id === categoryId)
			.filter((p) => {
				const required = requiresInspection(p);
				if (status === 'required') return required;
				if (status === 'not_required') return !required;
				if (status === 'mains_unmarked') return electrical && !required && !!mains[p.id];
				return true;
			})
			.filter((p) => matchesSearch(searchTrimmed, productLabel(p), ...(mains[p.id] ?? [])))
			.sort((a, b) => naturalCompare(productLabel(a), productLabel(b)))
	);
	let mainsUnmarkedCount = $derived(
		inspectable.filter((p) => !requiresInspection(p) && !!mains[p.id]).length
	);

	// A filter change keeps only what is still on screen selected: acting on a
	// row nobody can see is how a batch changes more than was meant.
	$effect(() => {
		const visible = new Set(rows.map((r) => r.id));
		for (const id of selected) if (!visible.has(id)) selected.delete(id);
	});

	let allSelected = $derived(rows.length > 0 && rows.every((r) => selected.has(r.id)));
	function toggleAll() {
		if (allSelected) selected.clear();
		else for (const r of rows) selected.add(r.id);
	}

	function choiceOf(p: Product) {
		const own = inspectionOverride(p, typeId);
		return own === null ? 'inherit' : own ? 'yes' : 'no';
	}
	function valueOf(choice: string) {
		return choice === 'yes' ? true : choice === 'no' ? false : null;
	}

	async function apply(productIds: string[], choice: string) {
		saving = true;
		try {
			const result = await setProductsInspectionRequirement({
				productIds,
				typeId,
				required: valueOf(choice)
			}).updates(...EQUIPMENT_VIEWS);
			if (result.refused.length > 0) {
				toast.warning(
					`${plural(result.refused.length, [
						'1 product left as it was, since it holds units of organizations you do not run:',
						'# products left as they were, since they hold units of organizations you do not run:'
					])} ${result.refused.join(', ')}`
				);
			}
			toast.success(
				`${plural(result.products, ['1 product saved', '# products saved'])} · ${plural(result.units, ['1 unit changed', '# units changed'])}`
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}

	async function applySelection(choice: string) {
		const ids = [...selected];
		const ok = await confirmAction({
			title:
				choice === 'yes'
					? plural(ids.length, [
							'Mark 1 product as needing inspection?',
							'Mark # products as needing inspection?'
						])
					: choice === 'no'
						? plural(ids.length, [
								'Mark 1 product as not needing inspection?',
								'Mark # products as not needing inspection?'
							])
						: plural(ids.length, [
								'Let 1 product follow its category?',
								'Let # products follow their category?'
							]),
			description:
				choice === 'no'
					? 'Their devices lose their interval for this type and leave the inspection list for it.'
					: "Devices that need inspecting and have no interval get their organization's default, and come due at once.",
			confirmLabel: 'Apply'
		});
		if (!ok) return;
		await apply(ids, choice);
		selected.clear();
	}
</script>

<div class="space-y-4">
	<p class="text-sm text-muted-foreground">
		Which products' devices need an inspection type. A product follows its category unless it is set
		otherwise; the category default is set under Admin › Categories.
	</p>

	<div class="flex flex-wrap items-center gap-2">
		<select
			bind:value={typeId}
			aria-label="Inspection type"
			class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-ring focus:outline-none"
		>
			{#each types as type (type.id)}
				<option value={type.id}>{inspectionTypeLabel(type)}</option>
			{/each}
		</select>
		<input
			type="search"
			bind:value={search}
			placeholder="Search by product or connector…"
			class="h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
		/>
		<select
			bind:value={categoryId}
			aria-label="Category"
			class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
		>
			<option value="">All categories</option>
			{#each categories as c (c.id)}<option value={c.id}>{categoryLabel(c)}</option>{/each}
		</select>
		<div class="flex flex-wrap items-center gap-1">
			{#each [{ key: 'all', label: 'All' }, { key: 'required', label: 'Needs inspection' }, { key: 'not_required', label: 'No inspection' }, ...(electrical ? [{ key: 'mains_unmarked', label: `Mains, not marked (${mainsUnmarkedCount})` }] : [])] as option (option.key)}
				<button
					type="button"
					onclick={() => (status = option.key as Status)}
					class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {status === option.key
						? 'bg-primary text-primary-foreground'
						: 'bg-muted text-muted-foreground hover:bg-muted/70'}">{option.label}</button
				>
			{/each}
		</div>
	</div>

	{#if !ready}
		<ContentSkeleton shape="table" count={10} {error} />
	{:else if rows.length === 0}
		<div class="rounded-md border py-12 text-center text-sm text-muted-foreground">
			No products in this filter.
		</div>
	{:else}
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/30 text-left text-muted-foreground">
						<th class="w-10 px-3 py-2">
							<input
								type="checkbox"
								aria-label="Select all"
								checked={allSelected}
								onchange={toggleAll}
							/>
						</th>
						<th class="px-3 py-2 font-medium">Product</th>
						<th class="px-3 py-2 font-medium">Category</th>
						<th class="px-3 py-2 text-right font-medium">Devices</th>
						<th class="px-3 py-2 font-medium">Mains</th>
						<th class="w-80 px-3 py-2 font-medium">
							{types.find((t) => t.id === typeId)
								? inspectionTypeLabel(types.find((t) => t.id === typeId)!)
								: ''}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as product (product.id)}
						{@const required = requiresInspection(product)}
						{@const connectors = mains[product.id] ?? []}
						<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
							<td class="px-3 py-2">
								<input
									type="checkbox"
									aria-label="Select"
									checked={selected.has(product.id)}
									onchange={(e) =>
										(e.currentTarget as HTMLInputElement).checked
											? selected.add(product.id)
											: selected.delete(product.id)}
								/>
							</td>
							<td class="px-3 py-2">
								<div class="flex items-center gap-2">
									<ProductThumb path={product.imagePath} alt={product.name} size={28} />
									<a
										href={resolve(`products/${product.id}`)}
										class="font-medium underline-offset-2 hover:underline"
										>{productLabel(product)}</a
									>
								</div>
							</td>
							<td class="px-3 py-2">
								<CategoryPill
									name={categoryLabel(product.category)}
									color={product.category.color}
								/>
							</td>
							<td class="px-3 py-2 text-right font-mono tabular-nums">{product.assetCount}</td>
							<td class="px-3 py-2">
								{#if connectors.length > 0}
									<span
										class="inline-flex items-center gap-1 text-xs {required
											? 'text-muted-foreground'
											: 'text-amber-700 dark:text-amber-500'}"
										title={connectors.join(', ')}
									>
										<Zap aria-hidden="true" class="size-3.5" />
										{connectors.join(', ')}
									</span>
								{/if}
							</td>
							<td class="px-3 py-2">
								<select
									aria-label="Inspection requirement"
									value={choiceOf(product)}
									disabled={saving}
									onchange={(e) =>
										apply([product.id], (e.currentTarget as HTMLSelectElement).value)}
									class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none {required
										? 'font-medium'
										: 'text-muted-foreground'}"
								>
									<option value="inherit">
										{byCategory(product)
											? 'Like category: needs inspection'
											: 'Like category: no inspection'}
									</option>
									<option value="yes">Needs inspection</option>
									<option value="no">No inspection</option>
								</select>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

{#if selected.size > 0}
	<div
		class="fixed right-0 bottom-0 left-0 z-40 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm"
	>
		<div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
			<span class="text-sm font-medium"
				>{plural(selected.size, ['1 product selected', '# products selected'])}</span
			>
			<button
				type="button"
				onclick={() => selected.clear()}
				class="text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				Clear
			</button>
			<div class="ml-auto flex flex-wrap items-center gap-2">
				<Button size="sm" disabled={saving} onclick={() => applySelection('yes')}
					>Needs inspection</Button
				>
				<Button size="sm" variant="outline" disabled={saving} onclick={() => applySelection('no')}
					>No inspection</Button
				>
				<Button
					size="sm"
					variant="outline"
					disabled={saving}
					onclick={() => applySelection('inherit')}>Like category</Button
				>
			</div>
		</div>
	</div>
{/if}
