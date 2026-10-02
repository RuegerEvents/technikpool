<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Card from '#lib/components/ui/card/index.js';
	import { getDpaOverview, getLegalSettings } from '#lib/remote/legal.remote.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import { LEGAL_SLUGS, legalTitle, type LegalSlug } from '#lib/legal.svelte.js';
	import LegalEditor from './legal-editor.svelte';

	let settingsQuery = $derived(getLegalSettings());
	let docs = $derived(settingsQuery.current ?? []);
	let dpaQuery = $derived(getDpaOverview());
	let dpa = $derived(dpaQuery.current);

	// One text per tab, the open one kept in ?tab= so a reload or a link lands on it.
	let tab = $derived.by((): LegalSlug => {
		const value = page.url.searchParams.get('tab');
		return LEGAL_SLUGS.includes(value as LegalSlug) ? (value as LegalSlug) : 'imprint';
	});
	let doc = $derived(docs.find((d) => d.slug === tab));
	let configured = (slug: LegalSlug) => {
		const d = docs.find((x) => x.slug === slug);
		return !!d && (!!d.externalUrl.trim() || !!d.body.trim());
	};

	function selectTab(slug: LegalSlug) {
		const url = new URL(page.url.href);
		url.searchParams.set('tab', slug);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- updating query params on the current route, not navigating to a typed path
		goto(url, { replace: true, reset: false });
	}
</script>

<svelte:head><title>Legal pages | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Legal pages</h1>
		<p class="text-muted-foreground">
			Your imprint, privacy policy and terms of use. They are linked below the sign-in and sign-up
			forms, in the user menu and in the scanner app's settings. Templates to start from are in the
			repository under docs/legal.
		</p>
	</div>

	<div role="tablist" class="flex flex-wrap gap-1 border-b">
		{#each LEGAL_SLUGS as slug (slug)}
			<button
				type="button"
				role="tab"
				aria-selected={tab === slug}
				onclick={() => selectTab(slug)}
				class="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors {tab ===
				slug
					? 'border-foreground text-foreground'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				{legalTitle(slug)}
				{#if settingsQuery.ready && !configured(slug)}
					<span
						class="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
						title="Not set up"
						aria-label="Not set up"
					></span>
				{/if}
			</button>
		{/each}
	</div>

	{#if !settingsQuery.ready}
		<ContentSkeleton shape="form" count={3} error={settingsQuery.error} />
	{:else if doc}
		{#key doc.slug}
			<LegalEditor {doc} />
		{/key}
	{/if}

	{#if tab === 'dpa'}
		<Card.Root>
			<Card.Header>
				<Card.Title>Accepted agreements</Card.Title>
				<Card.Description>
					The latest acceptance of each organization. System admins are not asked to accept it,
					since they run this server.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if !dpaQuery.ready || !dpa}
					<ContentSkeleton shape="table" count={4} error={dpaQuery.error} />
				{:else if !dpa.active}
					<p class="text-sm text-muted-foreground">No data processing agreement is set up.</p>
				{:else}
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b text-left text-muted-foreground">
								<th class="py-2 pr-4 font-medium">Organization</th>
								<th class="py-2 pr-4 font-medium">Status</th>
								<th class="py-2 pr-4 font-medium">Accepted by</th>
								<th class="py-2 font-medium"></th>
							</tr>
						</thead>
						<tbody>
							{#each dpa.orgs as org (org.id)}
								<tr class="border-b last:border-0">
									<td class="py-2 pr-4">{org.name}</td>
									<td class="py-2 pr-4">
										{#if !org.latest}
											<span class="text-destructive">Not accepted</span>
										{:else if org.latest.current}
											Current version
										{:else}
											<span class="text-amber-600">Older version</span>
										{/if}
									</td>
									<td class="py-2 pr-4">
										{#if org.latest}
											{org.latest.userName}, {new Date(org.latest.acceptedAt).toLocaleString()}
										{/if}
									</td>
									<td class="py-2 text-right">
										{#if org.latest}
											<a
												href={resolve(`api/dpa-acceptances/${org.latest.id}`)}
												target="_blank"
												class="underline">PDF</a
											>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
