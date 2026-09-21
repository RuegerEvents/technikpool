<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import type { SvelteSet } from 'svelte/reactivity';
	import { categoryLabel } from '$lib/category';
	import { orgLabel } from '$lib/utils';
	import { getLicenses } from '$lib/remote/licenses.remote';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { AssetStatusBadge } from '$lib/components/ui/asset-status';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { LicenseRevealModal } from '$lib/components/ui/license-credentials';

	type Props = {
		organizationId: string;
		search: string;
		categoryId: string;
		/** The Devices page's selection, so the bulk bar can check licenses out. */
		selectedIds: SvelteSet<string>;
	};

	let { organizationId, search, categoryId, selectedIds }: Props = $props();

	// Which licenses: every one, the ones out with a production, or the ones
	// nobody has — the last is the question before a show ("is there a seat left?").
	const holderFilters = [
		['', 'All'],
		['out', 'Checked out'],
		['free', 'Not checked out']
	] as const;
	let holderFilter = $state<'' | 'out' | 'free'>('');

	let licensesQuery = $derived(getLicenses(organizationId || undefined));
	let licenses = $derived(licensesQuery.current ?? []);

	let term = $derived(search.toLowerCase().trim());
	let visible = $derived(
		licenses.filter((l) => {
			if (categoryId && l.product.categoryId !== categoryId) return false;
			if (holderFilter === 'out' && l.holders.length === 0) return false;
			if (holderFilter === 'free' && l.holders.length > 0) return false;
			if (!term) return true;
			return [
				l.product.name,
				l.product.manufacturer?.name,
				l.assetTag,
				l.serialNumber,
				orgLabel(l.organization),
				l.location.name,
				...l.holders.flatMap((h) => [h.productionName, h.checkedOutBy])
			].some((v) => v?.toLowerCase().includes(term));
		})
	);

	let allSelected = $derived(visible.length > 0 && visible.every((l) => selectedIds.has(l.id)));

	function toggleAll() {
		if (allSelected) visible.forEach((l) => selectedIds.delete(l.id));
		else visible.forEach((l) => selectedIds.add(l.id));
	}

	function toggle(id: string) {
		if (selectedIds.has(id)) selectedIds.delete(id);
		else selectedIds.add(id);
	}

	type License = (typeof licenses)[number];

	// A license lent in from another org can't be opened — its page is that
	// org's, and so is the production. For crew on that production, the row
	// is the only way to the key, so clicking it asks for the key instead.
	let revealFor = $state<License | null>(null);
	let revealOpen = $state(false);

	function canRevealHere(license: License) {
		return !license.canOpen && license.canReveal && !!license.storedKind;
	}

	function openRow(license: License) {
		if (license.canOpen) {
			goto(resolve(`/assets/${license.id}`));
		} else if (canRevealHere(license)) {
			revealFor = license;
			revealOpen = true;
		}
	}

	function formatDate(date: Date | null) {
		return date ? new Date(date).toLocaleDateString('de-DE') : '';
	}
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-1">
		{#each holderFilters as [value, label] (value)}
			<button
				type="button"
				onclick={() => (holderFilter = value)}
				class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {holderFilter === value
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/70'}">{label}</button
			>
		{/each}
	</div>

	{#if !licensesQuery.ready}
		<ContentSkeleton shape="table" count={6} error={licensesQuery.error} />
	{:else if visible.length === 0}
		<div class="rounded-md border">
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-lg font-medium">No licenses</p>
				<p class="text-sm text-muted-foreground">
					{licenses.length === 0
						? 'Mark a product as a software license to register licenses.'
						: 'Try a different search term or filter.'}
				</p>
			</div>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="w-10 px-4 py-3">
							<input
								type="checkbox"
								checked={allSelected}
								onclick={toggleAll}
								class="h-4 w-4 cursor-pointer rounded border-input"
							/>
						</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">License</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Currently with</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Organization</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Credentials</th>
					</tr>
				</thead>
				<tbody>
					{#each visible as license (license.id)}
						<tr
							class="border-b align-top transition-colors last:border-0 hover:bg-muted/30 {license.canOpen ||
							canRevealHere(license)
								? 'cursor-pointer'
								: ''}"
							onclick={() => openRow(license)}
						>
							<td class="px-4 py-3">
								<input
									type="checkbox"
									checked={selectedIds.has(license.id)}
									onclick={(e) => {
										e.stopPropagation();
										toggle(license.id);
									}}
									class="h-4 w-4 cursor-pointer rounded border-input"
								/>
							</td>
							<td class="px-4 py-3">
								<div class="flex items-center gap-2">
									<ProductThumb
										path={license.product.imagePath}
										alt={license.product.name}
										size={28}
									/>
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-1.5">
											<span class="font-medium">{license.product.name}</span>
											<CategoryPill
												name={categoryLabel(license.product.category)}
												color={license.product.category.color}
											/>
										</div>
										<p class="text-xs text-muted-foreground">
											{[license.product.manufacturer?.name, license.assetTag, license.serialNumber]
												.filter(Boolean)
												.join(' · ')}
										</p>
									</div>
								</div>
							</td>
							<td class="px-4 py-3">
								{#if license.holders.length === 0}
									<span class="text-muted-foreground">In stock · {license.location.name}</span>
								{:else}
									{#each license.holders as holder, i (i)}
										<div>
											{#if holder.productionId}
												<a
													href={resolve(`/productions/${holder.productionId}`)}
													class="font-medium underline underline-offset-2"
													onclick={(e) => e.stopPropagation()}>{holder.productionName}</a
												>
											{:else}
												<span class="font-medium">{holder.productionName}</span>
											{/if}
											{#if holder.since || holder.checkedOutBy}
												<p class="text-xs text-muted-foreground">
													{#if holder.since}since {formatDate(holder.since)}{/if}
													{#if holder.checkedOutBy}· {holder.checkedOutBy}{/if}
												</p>
											{/if}
										</div>
									{/each}
								{/if}
							</td>
							<td class="px-4 py-3"><AssetStatusBadge status={license.status} /></td>
							<td class="px-4 py-3 text-muted-foreground">{orgLabel(license.organization)}</td>
							<td class="px-4 py-3">
								<!-- Only which kind is stored. The credentials themselves are on
								     the license's own page, behind a deliberate click. -->
								<span class="text-xs text-muted-foreground">
									{#if license.storedKind === 'key'}
										Key
									{:else if license.storedKind === 'login'}
										Account
									{:else}
										—
									{/if}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<LicenseRevealModal
	bind:open={revealOpen}
	assetId={revealFor?.id ?? null}
	title={revealFor
		? `${revealFor.product.name}${revealFor.assetTag ? ` · ${revealFor.assetTag}` : ''}`
		: ''}
/>
