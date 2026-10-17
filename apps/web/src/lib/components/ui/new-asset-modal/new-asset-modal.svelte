<script lang="ts" module>
	import type { NewAssetSeed } from '#lib/components/asset-form/index.js';

	/** What `bind:this` gives a caller. */
	export type NewAssetModalHandle = { reset: (seed?: string | NewAssetSeed) => void };
</script>

<script lang="ts">
	// Registering a unit at the moment you need it, rather than being sent to
	// /assets/new and back to put it where it belongs: an accessory on the asset
	// page, a member on the bundle pages. The form is /assets/new's own, compact
	// (see AssetForm); this only says where the unit lands and holds the buttons.
	import type { Snippet } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import type { LocationOption } from '#lib/components/ui/location-select/index.js';
	import { AssetForm } from '#lib/components/asset-form/index.js';
	import type { createAssets } from '#lib/remote/assets.remote.js';

	type Props = {
		open: boolean;
		organizationId: string;
		heading: string;
		/** Where the unit lands. Exactly one — an accessory's kit is its parent's. */
		parentAssetId?: string;
		bundleId?: string;
		/**
		 * Offer a location picker. Leave unset where the destination already
		 * decides it (a parent's location, a kit's own) — asking would imply a
		 * choice the server is going to override.
		 */
		locations?: LocationOption[];
		locationId?: string;
		/** Accessories are labelled far less often than they aren't. */
		defaultNoTag?: boolean;
		description?: Snippet;
		/** The created units, so a caller collecting them can take them straight. */
		onCreated?: (assets: Awaited<ReturnType<typeof createAssets>>) => void;
	};

	let {
		open = $bindable(false),
		organizationId,
		heading,
		parentAssetId,
		bundleId,
		locations,
		locationId,
		defaultNoTag = false,
		description,
		onCreated
	}: Props = $props();

	let seed = $state<string | NewAssetSeed>('');
	let saving = $state(false);

	/**
	 * Call before setting `open`. The form appears with the dialog and starts
	 * from this — see AssetForm's `reset`.
	 */
	export function reset(seedValue: string | NewAssetSeed = '') {
		seed = seedValue;
	}
</script>

<Modal bind:open title={heading} size="xl" dismissible={!saving} {description}>
	{#snippet children()}
		<AssetForm
			formId="new-asset-form"
			compact
			{organizationId}
			{parentAssetId}
			{bundleId}
			{locations}
			{locationId}
			{defaultNoTag}
			{seed}
			bind:saving
			onCreated={(created) => {
				open = false;
				onCreated?.(created);
			}}
		/>
	{/snippet}

	{#snippet footer()}
		<!-- The submit lives in the footer, outside the <form> it submits — that is
		     what `form=` is for, and it keeps the buttons pinned while the fields
		     scroll. -->
		<Button icon="add" type="submit" form="new-asset-form" disabled={saving}>
			{saving ? 'Creating…' : 'Create'}
		</Button>
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (open = false)}
			disabled={saving}
		>
			Cancel
		</Button>
	{/snippet}
</Modal>
