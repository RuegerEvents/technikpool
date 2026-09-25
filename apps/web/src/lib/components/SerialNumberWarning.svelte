<script lang="ts">
	import { getSerialNumberUse } from '$lib/remote/assets.remote';

	// A serial number is the manufacturer's, not ours: it is optional, it is free
	// text, and nothing stops two units carrying the same one. Saving a duplicate
	// stays allowed — the asset tag is what identifies a unit — but scanning a
	// serial only resolves when exactly one unit has it, so a clash costs that
	// unit its shortcut, and the person typing it is the one who can still say
	// whether it is a typo.
	//
	// Deliberately not awaited: an unanswered query shows nothing rather than
	// holding up the form someone is filling in.
	//
	// The units are joined into one string rather than drawn with an {#each},
	// because plain text following a nested fragment is dropped from the
	// catalogs — see the wuchale section of CLAUDE.md. One sentence, one msgid.

	// `paused` is the form's own saving flag. The check is debounced, so a save
	// sent inside the pause lands first and the check then finds the unit it
	// just created — a duplicate warning about itself, shown while the page
	// navigates away.
	let {
		serialNumber,
		excludeAssetId,
		paused = false
	}: { serialNumber: string; excludeAssetId?: string; paused?: boolean } = $props();

	// Debounced so a serial being typed costs one request at the pause, not one
	// per character. The effect settles a value; the fetch itself stays in the
	// $derived below, where reading remote data belongs.
	let settled = $state('');
	$effect(() => {
		// Dropping the settled value too, so a form that stays open after saving
		// ("create another") starts over instead of re-asking about the serial
		// it just saved.
		if (paused) {
			settled = '';
			return;
		}
		const next = serialNumber.trim();
		if (next === settled) return;
		const timer = setTimeout(() => (settled = next), 400);
		return () => clearTimeout(timer);
	});

	const useQuery = $derived(
		settled ? getSerialNumberUse({ serialNumber: settled, excludeAssetId }) : undefined
	);
	const others = $derived(useQuery?.current ?? []);
	const names = $derived(
		others.map((o) => `${o.product.name}${o.assetTag ? ` (${o.assetTag})` : ''}`).join(', ')
	);
</script>

{#if !paused && others.length > 0}
	<p class="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
		This serial number is already on {names}. Scanning it will no longer find a single unit.
	</p>
{/if}
