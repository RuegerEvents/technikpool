<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import { Dialog } from 'bits-ui';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getOverdueAssets, logInspection } from '$lib/remote/inspections.remote';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { toast } from 'svelte-sonner';

	let data = $derived(await getOverdueAssets());

	type AssetRow = Awaited<ReturnType<typeof getOverdueAssets>>['overdue'][number];

	let modalAsset = $state<AssetRow | null>(null);
	let performedAt = $state(new Date().toISOString().slice(0, 10));
	let result = $state<'PASSED' | 'FAILED'>('PASSED');
	let notes = $state('');
	let inspectorName = $state('');
	let saving = $state(false);

	function openModal(asset: AssetRow) {
		modalAsset = asset;
		performedAt = new Date().toISOString().slice(0, 10);
		result = 'PASSED';
		notes = '';
		inspectorName = '';
	}

	async function handleLog() {
		if (!modalAsset) return;
		saving = true;
		try {
			await logInspection({
				assetId: modalAsset.id,
				performedAt,
				result,
				notes: notes || undefined,
				inspectorName: inspectorName || undefined
			});
			toast.success('Inspection logged');
			modalAsset = null;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}

	function formatDate(d: Date) {
		return new Date(d).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head><title>Inspections | Technikpool</title></svelte:head>

<Dialog.Root
	open={modalAsset !== null}
	onOpenChange={(open) => {
		if (!open) modalAsset = null;
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg"
		>
			{#if modalAsset}
				<Dialog.Title class="text-base font-semibold">
					Log inspection — {modalAsset.product.name}
				</Dialog.Title>
				<Dialog.Description class="mt-1 text-sm text-muted-foreground">
					{modalAsset.assetTag ?? modalAsset.serialNumber ?? modalAsset.id}
				</Dialog.Description>
				<form
					class="mt-4 space-y-4"
					onsubmit={(e) => {
						e.preventDefault();
						handleLog();
					}}
				>
					<div class="space-y-2">
						<Label for="performedAt">Date</Label>
						<Input id="performedAt" type="date" bind:value={performedAt} required />
					</div>
					<div class="space-y-2">
						<Label for="result">Result</Label>
						<select
							id="result"
							bind:value={result}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
						>
							<option value="PASSED">Passed</option>
							<option value="FAILED">Failed</option>
						</select>
					</div>
					<div class="space-y-2">
						<Label for="inspectorName">Inspector</Label>
						<Input id="inspectorName" bind:value={inspectorName} placeholder="e.g. TÜV Nord" />
					</div>
					<div class="space-y-2">
						<Label for="notes">Notes</Label>
						<Input id="notes" bind:value={notes} placeholder="Optional" />
					</div>
					<div class="flex justify-end gap-2 pt-2">
						<Dialog.Close>
							<Button type="button" variant="outline">Cancel</Button>
						</Dialog.Close>
						<Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Log inspection'}</Button>
					</div>
				</form>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<div class="space-y-8">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">DGUV Inspections</h1>
		<p class="text-muted-foreground">Overdue and upcoming asset inspections across your orgs.</p>
	</div>

	<div>
		<h2 class="mb-3 text-xl font-semibold text-destructive">
			Overdue ({data.overdue.length})
		</h2>
		{#if data.overdue.length === 0}
			<Card.Root
				><Card.Content class="py-8 text-center text-muted-foreground">Nothing overdue.</Card.Content
				></Card.Root
			>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/30">
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Asset</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Due</th>
							<th class="w-32 px-4 py-3"></th>
						</tr>
					</thead>
					<tbody>
						{#each data.overdue as asset (asset.id)}
							<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<ProductThumb src={asset.product.imageUrl} alt={asset.product.name} />
										<div>
											<p class="font-medium">{asset.product.name}</p>
											<p class="text-xs text-muted-foreground">
												{asset.assetTag ?? asset.serialNumber ?? '—'}
											</p>
										</div>
									</div>
								</td>
								<td class="px-4 py-3">
									<OrgBadge
										name={orgLabel(asset.organization)}
										color={asset.organization.color}
										avatarLabel={asset.organization.avatarLabel}
									/>
								</td>
								<td class="px-4 py-3 text-muted-foreground">{asset.location.name}</td>
								<td class="px-4 py-3 font-medium text-destructive"
									>{formatDate(asset.nextInspectionDue!)}</td
								>
								<td class="px-4 py-3 text-right">
									<Button size="sm" variant="outline" onclick={() => openModal(asset)}
										>Log inspection</Button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<div>
		<h2 class="mb-3 text-xl font-semibold">
			Due soon ({data.upcoming.length})
		</h2>
		{#if data.upcoming.length === 0}
			<Card.Root
				><Card.Content class="py-8 text-center text-muted-foreground"
					>Nothing due in the next 30 days.</Card.Content
				></Card.Root
			>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/30">
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Asset</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Due</th>
							<th class="w-32 px-4 py-3"></th>
						</tr>
					</thead>
					<tbody>
						{#each data.upcoming as asset (asset.id)}
							<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<ProductThumb src={asset.product.imageUrl} alt={asset.product.name} />
										<div>
											<p class="font-medium">{asset.product.name}</p>
											<p class="text-xs text-muted-foreground">
												{asset.assetTag ?? asset.serialNumber ?? '—'}
											</p>
										</div>
									</div>
								</td>
								<td class="px-4 py-3">
									<OrgBadge
										name={orgLabel(asset.organization)}
										color={asset.organization.color}
										avatarLabel={asset.organization.avatarLabel}
									/>
								</td>
								<td class="px-4 py-3 text-muted-foreground">{asset.location.name}</td>
								<td class="px-4 py-3">{formatDate(asset.nextInspectionDue!)}</td>
								<td class="px-4 py-3 text-right">
									<Button size="sm" variant="outline" onclick={() => openModal(asset)}
										>Log inspection</Button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
