<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ChevronLeft } from '@lucide/svelte';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import { getOrgWithMembers } from '#lib/remote/orgs.remote.js';
	import { orgAccess } from './org-access.js';

	// The organization's page, in tabs: one route each, so a tab can be linked
	// to and the browser's Back works. Every tab reads the same org query.

	let { data, children } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let org = $derived(orgQuery.current);
	let access = $derived(orgAccess(org, data.user?.id, !!data.isAdmin));

	let base = $derived(resolve(`orgs/${orgId}`));
	let tabs = $derived(
		[
			{ href: base, label: 'Members', show: true, exact: true },
			{ href: `${base}/general`, label: 'General', show: access.canManage },
			{ href: `${base}/equipment`, label: 'Equipment', show: true },
			{ href: `${base}/billing`, label: 'Billing', show: access.canInventory },
			{ href: `${base}/data`, label: 'Data & legal', show: access.canManage }
		].filter((tab) => tab.show)
	);
	const path = $derived(page.url.pathname);
	const active = (tab: { href: string; exact?: boolean }) =>
		tab.exact ? path === tab.href : path === tab.href || path.startsWith(`${tab.href}/`);
</script>

<div class="space-y-6">
	{#if !org}
		<ContentSkeleton shape="form" count={6} error={orgQuery.error} />
	{:else}
		<div class="space-y-4">
			<div class="flex items-center gap-1">
				<a
					href={resolve('orgs')}
					class="-ml-2 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Organizations"
					title="Organizations"
				>
					<ChevronLeft class="size-6" />
				</a>
				<h1 class="min-w-0 text-3xl font-bold tracking-tight break-words">{org.name}</h1>
			</div>
			<nav class="-mx-4 overflow-x-auto border-b px-4" aria-label="Organization">
				<ul class="flex gap-1">
					{#each tabs as tab (tab.href)}
						<li>
							<a
								href={tab.href}
								aria-current={active(tab) ? 'page' : undefined}
								class="-mb-px block border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors {active(
									tab
								)
									? 'border-foreground text-foreground'
									: 'border-transparent text-muted-foreground hover:text-foreground'}"
								>{tab.label}</a
							>
						</li>
					{/each}
				</ul>
			</nav>
		</div>
		{@render children()}
	{/if}
</div>
