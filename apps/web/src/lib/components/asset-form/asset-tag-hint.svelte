<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { previewAutoTags } from '#lib/asset-tag-preview.js';
	import { getAssetTagSuggestion, setAutoAssetTags } from '#lib/remote/orgs.remote.js';
	import { getErrorMessage, plural } from '#lib/utils.js';

	// Under the tag fields of an org that does not number its units: a tag has
	// to be typed, and nobody at the form knows which number came last. Says
	// which one did, fills in the next free ones on request, and offers to let
	// the org number new units itself — after which the fields show their
	// numbers and this goes away. See `suggestTag`.

	let {
		organizationId,
		items
	}: {
		organizationId: string;
		/** The form's rows; blank tags are filled in place. */
		items: { assetTag: string }[];
	} = $props();

	let suggestionQuery = $derived(getAssetTagSuggestion(organizationId));
	let suggestion = $derived(suggestionQuery.current);
	let fills = $derived(
		suggestion?.next
			? previewAutoTags(
					suggestion.next,
					items.map((item) => item.assetTag)
				)
			: []
	);
	let blank = $derived(fills.filter(Boolean).length);

	function fill() {
		items.forEach((item, i) => {
			if (fills[i]) item.assetTag = fills[i];
		});
	}

	let turningOn = $state(false);
	async function numberAutomatically() {
		turningOn = true;
		try {
			await setAutoAssetTags({ orgId: organizationId, enabled: true });
			toast.success('New devices are now numbered automatically');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			turningOn = false;
		}
	}
</script>

{#if suggestion}
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
		<span>
			{#if suggestion.highest}
				Highest tag so far: <span class="font-mono">{suggestion.highest}</span>
			{:else}
				No tag in this organization's numbering yet.
			{/if}
		</span>
		{#if suggestion.next && blank > 0}
			<button
				type="button"
				onclick={fill}
				class="font-medium text-foreground underline underline-offset-2 hover:no-underline"
			>
				{#if blank === 1}
					Use {fills.find(Boolean)}
				{:else}
					{plural(blank, ['Fill in the next free number', 'Fill in the next # free numbers'])}
				{/if}
			</button>
		{/if}
		<button
			type="button"
			disabled={turningOn}
			onclick={numberAutomatically}
			class="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
		>
			Number new devices automatically
		</button>
	</div>
{/if}
