<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getOrgWithMembers } from '#lib/remote/orgs.remote.js';
	import { orgAccess } from '../org-access.js';
	import SubTabs from '../sub-tabs.svelte';

	let { data, children } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let access = $derived(orgAccess(orgQuery.current, data.user?.id, !!data.isAdmin));
	let base = $derived(resolve(`orgs/${orgId}/equipment`));
	let tabs = $derived(
		[
			{ href: base, label: 'Settings', show: true },
			{ href: `${base}/locations`, label: 'Locations', show: access.canManage },
			{ href: `${base}/value`, label: 'Equipment value', show: access.canSeeValue }
		].filter((tab) => tab.show)
	);
</script>

<div class="space-y-6">
	<SubTabs {tabs} />
	{@render children()}
</div>
