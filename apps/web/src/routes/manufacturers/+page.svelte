<script lang="ts">
	import { getErrorMessage, plural } from '$lib/utils';
	import {
		getManufacturers,
		mergeManufacturers,
		updateManufacturer
	} from '$lib/remote/assets.remote';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import { Modal } from '$lib/components/ui/modal';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let manufacturers = $derived(await getManufacturers());
	// Manufacturers are global rows shared by every org — renaming or merging
	// one rewrites labels on other orgs' inventory, so it's system-admin
	// territory (creating one from the asset wizard stays open to everyone).
	let canEdit = $derived(data.isAdmin);
	let search = $state('');
	let visible = $derived(
		manufacturers.filter((manufacturer) =>
			manufacturer.name.toLowerCase().includes(search.trim().toLowerCase())
		)
	);

	let drafts = $state<Record<string, { name: string; generic: boolean }>>({});
	function draftFor(manufacturer: (typeof manufacturers)[number]) {
		return drafts[manufacturer.id] ?? { name: manufacturer.name, generic: manufacturer.generic };
	}
	function changeName(manufacturer: (typeof manufacturers)[number], name: string) {
		drafts[manufacturer.id] = { ...draftFor(manufacturer), name };
	}
	function changeGeneric(manufacturer: (typeof manufacturers)[number], generic: boolean) {
		drafts[manufacturer.id] = { ...draftFor(manufacturer), generic };
	}
	function dirty(manufacturer: (typeof manufacturers)[number]) {
		const draft = draftFor(manufacturer);
		return draft.name.trim() !== manufacturer.name || draft.generic !== manufacturer.generic;
	}

	let saving = $state<string | null>(null);
	async function save(manufacturer: (typeof manufacturers)[number]) {
		saving = manufacturer.id;
		try {
			const draft = draftFor(manufacturer);
			await updateManufacturer({
				manufacturerId: manufacturer.id,
				name: draft.name,
				generic: draft.generic
			});
			delete drafts[manufacturer.id];
			await getManufacturers().refresh();
			toast.success('Manufacturer updated');
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			saving = null;
		}
	}

	let mergeSource = $state<(typeof manufacturers)[number] | null>(null);
	let mergeOpen = $state(false);
	let mergeTargetId = $state('');
	let merging = $state(false);
	async function merge() {
		if (!mergeSource || !mergeTargetId) return;
		merging = true;
		try {
			const result = await mergeManufacturers({
				targetManufacturerId: mergeTargetId,
				sourceManufacturerId: mergeSource.id
			});
			mergeSource = null;
			mergeOpen = false;
			mergeTargetId = '';
			await getManufacturers().refresh();
			toast.success(plural(result.movedProducts, ['# product moved', '# products moved']));
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			merging = false;
		}
	}
</script>

<svelte:head><title>Manufacturers | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Manufacturers</h1>
		<p class="text-muted-foreground">
			Manage catalog names, mark generic placeholders, and merge duplicate manufacturers.
		</p>
	</div>

	<Input type="search" bind:value={search} placeholder="Search manufacturers…" class="max-w-sm" />

	{#if !canEdit}
		<div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
			Manufacturers are shared across all organizations, so renaming or merging them is reserved for
			system administrators.
		</div>
	{/if}

	<Card.Root>
		<Card.Content class="p-0">
			{#each visible as manufacturer (manufacturer.id)}
				<div
					class="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[1fr_auto_auto_auto] md:items-center"
				>
					<Input
						value={draftFor(manufacturer).name}
						disabled={!canEdit}
						oninput={(event) =>
							changeName(manufacturer, (event.currentTarget as HTMLInputElement).value)}
					/>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={draftFor(manufacturer).generic}
							disabled={!canEdit}
							onchange={(event) => changeGeneric(manufacturer, event.currentTarget.checked)}
							class="h-4 w-4 rounded border-input"
						/>
						Generic
					</label>
					<span class="text-sm text-muted-foreground">
						{plural(manufacturer._count.products, ['# product', '# products'])}
					</span>
					<div class="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={!canEdit || !dirty(manufacturer) || saving === manufacturer.id}
							onclick={() => save(manufacturer)}
							>{saving === manufacturer.id ? 'Saving…' : 'Save'}</Button
						>
						<Button
							size="sm"
							variant="outline"
							disabled={!canEdit || manufacturers.length < 2}
							onclick={() => {
								mergeSource = manufacturer;
								mergeTargetId = '';
								mergeOpen = true;
							}}>Merge…</Button
						>
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
</div>

<Modal bind:open={mergeOpen} title="Merge manufacturer" dismissible={!merging}>
	{#snippet description()}
		All products move to the selected manufacturer. Existing offers and invoices are not changed.
	{/snippet}
	<div class="space-y-3">
		<p class="text-sm">
			Delete <span class="font-medium">{mergeSource?.name}</span> and move its products to:
		</p>
		<select
			bind:value={mergeTargetId}
			disabled={merging}
			class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
		>
			<option value="">Select manufacturer…</option>
			{#each manufacturers.filter((manufacturer) => manufacturer.id !== mergeSource?.id) as manufacturer (manufacturer.id)}
				<option value={manufacturer.id}>{manufacturer.name}</option>
			{/each}
		</select>
	</div>
	{#snippet footer()}
		<Button variant="outline" disabled={merging} onclick={() => (mergeOpen = false)}>Cancel</Button>
		<Button icon="merge" disabled={!mergeTargetId || merging} onclick={merge}>
			{merging ? 'Merging…' : 'Merge'}
		</Button>
	{/snippet}
</Modal>
