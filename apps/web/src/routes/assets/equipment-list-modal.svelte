<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { SheetProgress } from '#lib/components/sheet-progress/index.js';
	import { SheetDownload } from '#lib/equipment-sheet-download.svelte.js';
	import type { OrgListLayout } from '#lib/equipment-sheet.js';
	import { canManageInventory, type OrgRole } from '#lib/roles.js';
	import { orgLabel } from '#lib/utils.js';

	// An org's whole equipment as a PDF: a catalogue to hand a customer, or the
	// inventory by shelf. Prices are billing, offered to the org's admins only —
	// the server checks the same. See `renderOrgEquipmentList`.

	type Org = { id: string; name: string; shortName: string | null; role: OrgRole };

	let {
		open = $bindable(false),
		orgs,
		organizationId
	}: {
		open?: boolean;
		orgs: Org[];
		/** The org the Devices page is filtered to, if any: the list starts on it. */
		organizationId: string | undefined;
	} = $props();

	let chosenOrg = $state('');
	let layout = $state<OrgListLayout>('catalogue');
	let prices = $state(false);

	// Each opening starts on the org the page is showing.
	$effect(() => {
		if (!open) return;
		chosenOrg = orgs.some((o) => o.id === organizationId) ? organizationId! : (orgs[0]?.id ?? '');
	});

	let org = $derived(orgs.find((o) => o.id === chosenOrg));
	let mayPrice = $derived(!!org && (page.data.isAdmin || canManageInventory(org)));

	const download = new SheetDownload();

	function create() {
		if (!org) return;
		download.openOrgList(org.id, layout, prices && mayPrice);
		open = false;
	}
</script>

<Modal bind:open title="Equipment list" size="md">
	{#snippet children()}
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="equipment-list-org">Organization</Label>
				<select
					id="equipment-list-org"
					bind:value={chosenOrg}
					class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
				>
					{#each orgs as o (o.id)}<option value={o.id}>{orgLabel(o)}</option>{/each}
				</select>
			</div>

			<fieldset class="space-y-2">
				<legend class="text-sm font-medium">Layout</legend>
				<label class="flex cursor-pointer items-start gap-2 text-sm">
					<input type="radio" bind:group={layout} value="catalogue" class="mt-0.5" />
					<span>
						<span class="block font-medium">Catalogue</span>
						<span class="block text-muted-foreground"
							>One line per product and kit with how many there are, by category — what can be
							rented.</span
						>
					</span>
				</label>
				<label class="flex cursor-pointer items-start gap-2 text-sm">
					<input type="radio" bind:group={layout} value="inventory" class="mt-0.5" />
					<span>
						<span class="block font-medium">Inventory</span>
						<span class="block text-muted-foreground"
							>Everything by location, with every unit's tag or serial number.</span
						>
					</span>
				</label>
			</fieldset>

			{#if mayPrice}
				<label class="flex cursor-pointer items-start gap-2 text-sm">
					<input type="checkbox" bind:checked={prices} class="mt-0.5" />
					<span>
						<span class="block font-medium">With rental prices</span>
						<span class="block text-muted-foreground"
							>Net price per day, as an offer would charge it.</span
						>
					</span>
				</label>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<Button icon="download" disabled={!org || download.busy} onclick={create}>Create PDF</Button>
		<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
	{/snippet}
</Modal>

<SheetProgress {download} />
