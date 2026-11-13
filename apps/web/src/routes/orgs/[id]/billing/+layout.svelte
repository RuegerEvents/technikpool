<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import SubTabs from '../sub-tabs.svelte';

	let { children } = $props();

	const orgId = $derived(page.params.id as string);
	let base = $derived(resolve(`orgs/${orgId}/billing`));
	let tabs = $derived([
		{ href: base, label: 'Billing details' },
		{ href: `${base}/rates`, label: 'Rates & services' }
	]);
</script>

<div class="space-y-6">
	<SubTabs {tabs} />
	{@render children()}
</div>
