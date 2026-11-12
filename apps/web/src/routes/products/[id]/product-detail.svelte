<script lang="ts">
	import { rowLinkClick } from '#lib/row-link.js';
	import { BackButton } from '#lib/components/ui/back-button/index.js';
	// One catalog product: everything about it that can be changed — the same
	// editor the /products wizard steps through — and every unit of it this user
	// can see. Where the Devices list and a unit's page lead to when the question
	// is about the model rather than one box of it.
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import {
		ProductActions,
		ProductEditor,
		type ProductEditorActions
	} from '#lib/components/ui/product-editor/index.js';
	import { AssetStatusBadge } from '#lib/components/ui/asset-status/index.js';
	import { AssetPlace, placeOf } from '#lib/components/ui/asset-place/index.js';
	import { ProductDocuments } from '#lib/components/ui/product-documents/index.js';
	import {
		getCategories,
		getManufacturers,
		getProductCatalog,
		getProducts,
		getProductUnits
	} from '#lib/remote/assets.remote.js';
	import { getMyOrgs } from '#lib/remote/orgs.remote.js';
	import {
		getInspectionTypes,
		getProductInspectionIntervals,
		setProductInspectionInterval,
		setProductInspectionRequirement
	} from '#lib/remote/inspections.remote.js';
	import { categoryLabel } from '#lib/category.js';
	import {
		INSPECTION_TYPE_IDS,
		inspectionOverride,
		requiresInspection
	} from '#lib/inspection-due.js';
	import { inspectionTypeLabel } from '#lib/inspection-ui.svelte.js';
	import { MainsHint } from '#lib/components/ui/mains-hint/index.js';
	import { getErrorMessage, orgLabel, plural } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';
	import { canManageInventory } from '#lib/roles.js';
	import { Plus } from '@lucide/svelte';

	type Props = { productId: string; isAdmin: boolean; userId: string | undefined };

	let { productId, isAdmin, userId }: Props = $props();

	// The unfiltered catalog rather than a query of its own: it is what every
	// product mutation already refreshes, so this page stays current without a
	// refresh call anywhere new. The units are the one exception — a system admin
	// sees every org's here, which no shared list carries. Nothing on this page
	// changes a unit, and the query is fetched afresh whenever the page opens.
	let catalog = $derived(await getProductCatalog());
	let product = $derived(catalog.find((p) => p.id === productId) ?? null);
	let units = $derived(await getProductUnits(productId));
	let orgs = $derived(await getMyOrgs());
	let categories = $derived(await getCategories());
	let manufacturers = $derived(await getManufacturers());
	let allProducts = $derived(await getProducts());
	let unitCounts = $derived(new Map(catalog.map((p) => [p.id, p.assetCount])));
	let severalOrgs = $derived(new Set(units.map((a) => a.organizationId)).size > 1);

	// What happens to the product as a whole sits up by its name; the card below
	// is for its fields. The dialogs stay in the editor, which saves pending
	// edits before a merge or a copy.
	let editor = $state<ReturnType<typeof ProductEditor>>();
	let actions = $state<ProductEditorActions>();

	// Per inspection type: the category's answer unless the product gives its
	// own. Saved on change, since it moves the interval of every unit of it.
	let inspectionTypes = $derived(await getInspectionTypes());
	// Per org the user runs: its interval for this product per type, over its default.
	let productIntervalsQuery = $derived(getProductInspectionIntervals(productId));
	let productIntervals = $derived(productIntervalsQuery.current ?? []);
	async function setProductInterval(
		organizationId: string,
		typeId: string,
		input: HTMLInputElement,
		stored: number | null
	) {
		const months = input.value ? Number(input.value) : null;
		if (months === stored) return;
		try {
			const result = await setProductInspectionInterval({
				organizationId,
				productId,
				typeId,
				months
			});
			toast.success(plural(result.changed, ['Saved · 1 unit changed', 'Saved · # units changed']));
		} catch (err) {
			input.value = stored?.toString() ?? '';
			toast.error(getErrorMessage(err));
		}
	}
	let savingInspection = $state(false);
	function overrideValue(typeId: string) {
		if (!product) return 'inherit';
		const own = inspectionOverride(product, typeId);
		return own === null ? 'inherit' : own ? 'yes' : 'no';
	}
	async function setInspection(typeId: string, select: HTMLSelectElement) {
		if (!product) return;
		const choice = select.value;
		savingInspection = true;
		try {
			const result = await setProductInspectionRequirement({
				productId: product.id,
				typeId,
				required: choice === 'yes' ? true : choice === 'no' ? false : null
			});
			toast.success(plural(result.changed, ['Saved · 1 unit changed', 'Saved · # units changed']));
		} catch (err) {
			// Refused (someone else's units): show what is stored, not the choice.
			select.value = overrideValue(typeId);
			toast.error(getErrorMessage(err));
		} finally {
			savingInspection = false;
		}
	}
</script>

<svelte:head><title>{product?.name ?? 'Product'} | Technikpool</title></svelte:head>

{#if !product}
	<div class="space-y-4">
		<h1 class="text-3xl font-bold tracking-tight">Product not found</h1>
		<p class="text-muted-foreground">It may have been merged into another product or deleted.</p>
		<BackButton fallback={resolve('products')} />
	</div>
{:else}
	<div class="space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="flex min-w-0 items-center gap-4">
				<ProductThumb path={product.imagePath} alt={product.name} size={56} />
				<div class="min-w-0">
					<h1 class="text-3xl font-bold tracking-tight">{product.name}</h1>
					{#if product.manufacturer}
						<p class="text-muted-foreground">{product.manufacturer.name}</p>
					{/if}
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<BackButton variant="ghost" fallback={resolve('products')} />
				{#if orgs.some(canManageInventory)}
					<Button
						variant="outline"
						href="{resolve('assets/new')}?product={encodeURIComponent(product.id)}"
					>
						<Plus aria-hidden="true" class="mr-1 size-4" />
						Add devices
					</Button>
				{/if}
				{#if actions}
					<ProductActions
						{actions}
						onDuplicate={() => editor?.openDuplicate()}
						onMerge={() => editor?.openMerge()}
						onDelete={() => editor?.openDelete()}
					/>
				{/if}
			</div>
		</div>

		<div class="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
			<ProductEditor
				bind:this={editor}
				bind:actions
				showActions={false}
				{product}
				{orgs}
				{categories}
				{manufacturers}
				{allProducts}
				{unitCounts}
				{isAdmin}
				{userId}
				idPrefix="product-page"
				onMerged={(survivorId) => {
					if (survivorId !== productId) goto(resolve(`products/${survivorId}`), { replace: true });
				}}
				onDeleted={() => goto(resolve('products'), { replace: true })}
			/>

			<div class="space-y-6 self-start">
				<Card.Root>
					<Card.Header>
						<Card.Title>Units</Card.Title>
						<Card.Description>
							{#if isAdmin}
								Every unit of this product in every organization. Retired units are not listed.
							{:else}
								Every unit of this product in your organizations. Retired units are not listed.
							{/if}
						</Card.Description>
					</Card.Header>
					<Card.Content class="p-0">
						{#if units.length === 0}
							<p class="px-6 pb-6 text-sm text-muted-foreground">
								{#if isAdmin}
									No organization holds a unit of this product.
								{:else}
									None of your organizations holds a unit of this product.
								{/if}
							</p>
						{:else}
							<!-- Half the page wide at most, so it scrolls sideways rather than squeezing
						     six columns into wrapped fragments. -->
							<div class="overflow-x-auto border-t">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b bg-muted/30 text-left text-xs text-muted-foreground">
											<th class="px-4 py-2 font-medium">Tag</th>
											{#if severalOrgs}
												<th class="px-4 py-2 font-medium">Organization</th>
											{/if}
											<th class="px-4 py-2 font-medium">Case</th>
											<th class="px-4 py-2 font-medium">Location</th>
											<th class="px-4 py-2 font-medium">S/N</th>
											<th class="px-4 py-2 font-medium">Status</th>
										</tr>
									</thead>
									<tbody>
										{#each units as unit (unit.id)}
											<tr
												class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
												onclick={() => goto(resolve(`assets/${unit.id}`))}
											>
												<td class="px-4 py-2">
													<a
														href={resolve(`assets/${unit.id}`)}
														class="font-mono whitespace-nowrap hover:underline"
														onclick={rowLinkClick}>{unit.assetTag ?? '—'}</a
													>
													{#if unit.parent}
														<a
															href={resolve(`assets/${unit.parent.id}`)}
															class="block text-xs whitespace-nowrap text-muted-foreground hover:underline"
															onclick={rowLinkClick}
														>
															↳ Accessory of {unit.parent.product.name}
															{unit.parent.assetTag ?? ''}
														</a>
													{/if}
												</td>
												{#if severalOrgs}
													<td class="px-4 py-2 whitespace-nowrap text-muted-foreground"
														>{orgLabel(unit.organization)}</td
													>
												{/if}
												<td class="px-4 py-2 text-muted-foreground"
													>{unit.bundle?.template.name ?? '—'}</td
												>
												<td class="px-4 py-2 text-muted-foreground"
													><AssetPlace place={placeOf(unit)} /></td
												>
												<td
													class="px-4 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground"
													>{unit.serialNumber ?? '—'}</td
												>
												<td class="px-4 py-2"><AssetStatusBadge status={unit.status} /></td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
				{#if !product.isLicense}
					<Card.Root>
						<Card.Header>
							<Card.Title>Inspections</Card.Title>
							<Card.Description>
								Which inspections its devices need, and how often. A device follows its
								organization's interval for the type unless one is set for this product here.
							</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-3">
							{#each inspectionTypes as type (type.id)}
								{@const byCategory = product.category.inspectionTypes.some(
									(t) => t.typeId === type.id
								)}
								<div class="grid items-center gap-2 sm:grid-cols-[8rem_1fr]">
									<label for="inspection-{type.id}" class="text-sm font-medium"
										>{inspectionTypeLabel(type)}</label
									>
									<select
										id="inspection-{type.id}"
										value={overrideValue(type.id)}
										disabled={savingInspection}
										onchange={(e) => setInspection(type.id, e.currentTarget as HTMLSelectElement)}
										class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
									>
										<option value="inherit">
											{byCategory
												? `Like ${categoryLabel(product.category)}: needed`
												: `Like ${categoryLabel(product.category)}: not needed`}
										</option>
										<option value="yes">Needed</option>
										<option value="no">Not needed</option>
									</select>
								</div>
								{#if requiresInspection(product, type.id)}
									{#each productIntervals as entry (entry.org.id)}
										{@const row = entry.types.find((t) => t.typeId === type.id)}
										{#if row}
											<div class="grid items-center gap-2 sm:grid-cols-[8rem_1fr]">
												<span></span>
												<div class="flex flex-wrap items-center gap-2 text-sm">
													{#if productIntervals.length > 1}
														<span class="font-medium">{orgLabel(entry.org)}:</span>
													{/if}
													<span class="text-muted-foreground">Every</span>
													<input
														type="number"
														min="1"
														max="120"
														aria-label="Interval in months"
														value={row.own ?? ''}
														placeholder={row.orgDefault?.toString() ?? '—'}
														onchange={(e) =>
															setProductInterval(
																entry.org.id,
																type.id,
																e.currentTarget as HTMLInputElement,
																row.own
															)}
														class="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
													/>
													<span class="text-muted-foreground">months</span>
													{#if !row.own}
														<span class="text-xs text-muted-foreground"
															>{row.orgDefault
																? "Organization's default"
																: 'The organization tracks none of this type'}</span
														>
													{/if}
												</div>
											</div>
										{/if}
									{/each}
								{/if}
							{/each}
							<MainsHint
								productId={product.id}
								required={requiresInspection(product, INSPECTION_TYPE_IDS.electrical)}
							/>
						</Card.Content>
					</Card.Root>
				{/if}

				<Card.Root>
					<Card.Header>
						<Card.Title>PDFs</Card.Title>
						<Card.Description
							>Manuals, datasheets and the like, for every unit of it.</Card.Description
						>
					</Card.Header>
					<Card.Content>
						<ProductDocuments {productId} />
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	</div>
{/if}
