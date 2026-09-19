<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		getMyOrgs,
		getAllOrgs,
		createOrg,
		getOrgIdentityInUse,
		setHomeOrg
	} from '$lib/remote/orgs.remote';
	import { Star } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { plural, getErrorMessage, orgLabel, getContrastingTextColor } from '$lib/utils';
	import { roleName } from '$lib/role-descriptions.svelte';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { Modal } from '$lib/components/ui/modal';
	import { ORG_COLOR_PALETTE, suggestOrgColor } from '$lib/org-colors';
	import { orgIdentityProblem } from '$lib/org-identity.svelte';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';

	let { data } = $props();

	let orgsQuery = $derived(data.isAdmin ? getAllOrgs() : getMyOrgs());
	let orgs = $derived(orgsQuery.current ?? []);
	// Colour, label and prefix are unique across all orgs, including ones this user cannot see.
	let identityQuery = $derived(getOrgIdentityInUse());
	let identityInUse = $derived(identityQuery.current ?? []);
	let takenColors = $derived(identityInUse.map((o) => o.color.toLowerCase()));
	let freePalette = $derived(ORG_COLOR_PALETTE.filter((c) => !takenColors.includes(c)));
	let newOrgName = $state('');
	let newOrgShortName = $state('');
	let newOrgPrefix = $state('');
	let newOrgColor = $state(ORG_COLOR_PALETTE[0]);
	let newOrgAvatarLabel = $state('');
	let creating = $state(false);
	let createOpen = $state(false);

	// One star per user: the home org, which the device list opens on. The layout
	// works out which one it is — a starred org, or the fallback when none is —
	// so re-running it after a change is what moves the star.
	let starring = $state<string | null>(null);

	async function star(orgId: string) {
		if (orgId === data.homeOrgId || starring) return;
		starring = orgId;
		try {
			await setHomeOrg(orgId);
			await invalidateAll();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			starring = null;
		}
	}

	function openCreate() {
		newOrgColor = suggestOrgColor(takenColors);
		createOpen = true;
	}

	// The dashboard sends someone who has no org yet here with `?new`, to land in
	// the dialog rather than next to it. It waits for the identities in use, since
	// the colour it suggests is the first one nobody has taken.
	let openOnArrival = $state(page.url.searchParams.has('new'));

	$effect(() => {
		if (!openOnArrival || !identityQuery.ready) return;
		openOnArrival = false;
		openCreate();
	});

	async function handleCreateOrg(e: Event) {
		e.preventDefault();
		if (!newOrgName) return;
		const problem = orgIdentityProblem(
			{ color: newOrgColor, avatarLabel: newOrgAvatarLabel, assetIdPrefix: newOrgPrefix },
			identityInUse
		);
		if (problem) {
			toast.error(problem);
			return;
		}
		try {
			creating = true;
			await createOrg({
				name: newOrgName,
				shortName: newOrgShortName || undefined,
				assetIdPrefix: newOrgPrefix,
				color: newOrgColor,
				avatarLabel: newOrgAvatarLabel
			});
			toast.success(`Organization "${newOrgName}" created!`);
			// The nav keeps the org-scoped pages from someone without an org, and that
			// answer comes from the layout's load — a first org has to reach it.
			if (!data.hasOrg) await invalidateAll();
			createOpen = false;
			newOrgName = '';
			newOrgShortName = '';
			newOrgPrefix = '';
			newOrgAvatarLabel = '';
			// The colour is not reset here — `openCreate` picks the next free one when the
			// dialog is opened again, by which time the new org is in `takenColors`.
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			creating = false;
		}
	}
</script>

<svelte:head><title>Organizations | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Organizations</h1>
			<p class="text-muted-foreground">
				{data.isAdmin
					? 'All organizations in the system.'
					: 'Manage your organizations and memberships.'}
			</p>
		</div>
		<Button onclick={openCreate}>New Organization</Button>
	</div>

	<div class="space-y-4">
		<h2 class="text-xl font-semibold">
			{data.isAdmin ? `All Organizations (${orgs.length})` : 'Your Organizations'}
		</h2>
		{#if !orgsQuery.ready}
			<ContentSkeleton count={4} error={orgsQuery.error} />
		{:else if orgs.length === 0}
			<p class="text-muted-foreground">
				{data.isAdmin
					? 'No organizations exist yet.'
					: 'You are not a member of any organization yet.'}
			</p>
		{:else}
			<div class="grid gap-4">
				{#each orgs as org (org.id)}
					<Card.Root>
						<Card.Content class="flex items-center justify-between py-4">
							<div>
								<p class="flex items-center gap-1.5 font-medium">
									{#if org.role}
										{@const home = org.id === data.homeOrgId}
										<button
											type="button"
											class="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default"
											aria-pressed={home}
											aria-label={home ? 'Home organization' : 'Make home organization'}
											title={home
												? 'Home organization — lists open on it'
												: 'Make home organization — lists open on it'}
											disabled={home || starring !== null}
											onclick={() => star(org.id)}
										>
											<Star class="size-4 {home ? 'fill-foreground text-foreground' : ''}" />
										</button>
									{/if}
									<OrgBadge name={orgLabel(org)} color={org.color} avatarLabel={org.avatarLabel} />
								</p>
								<p class="text-sm text-muted-foreground">
									{#if org.role}
										Role: {roleName(org.role)}
									{:else if data.isAdmin && 'memberCount' in org}
										{plural(org.memberCount, ['# member', '# members'])}
									{/if}
								</p>
							</div>
							<div class="flex gap-2">
								{#if org.role === 'OWNER' || data.isAdmin}
									<Button variant="outline" href={resolve(`/orgs/${org.id}`)}>Manage</Button>
								{/if}
								<Button variant="outline" href={resolve(`/assets?org=${org.id}`)}
									>View Assets</Button
								>
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	</div>
</div>

<Modal bind:open={createOpen} title="Create Organization" dismissible={!creating}>
	{#snippet children()}
		<form id="create-org-form" onsubmit={handleCreateOrg} class="space-y-4">
			<div class="space-y-2">
				<Label for="orgName">Organization Name</Label>
				<Input id="orgName" bind:value={newOrgName} placeholder="e.g. Acme Corp" required />
			</div>
			<div class="space-y-2">
				<Label for="orgShortName"
					>Short Name <span class="text-muted-foreground">(optional)</span></Label
				>
				<Input
					id="orgShortName"
					bind:value={newOrgShortName}
					placeholder="e.g. Acme"
					maxlength={24}
				/>
				<p class="text-xs text-muted-foreground">
					Shown instead of the full name in tables and pickers.
				</p>
			</div>
			<div class="space-y-2">
				<Label for="orgPrefix">Asset ID Prefix</Label>
				<Input
					id="orgPrefix"
					bind:value={newOrgPrefix}
					placeholder="e.g. 123"
					maxlength={3}
					minlength={3}
					pattern="[0-9][0-9][0-9]"
					required
					class="w-24"
				/>
				<p class="text-xs text-muted-foreground">
					3-digit prefix for asset IDs (e.g. 123 → 12300001).
				</p>
			</div>
			<div class="flex gap-4">
				<div class="space-y-2">
					<Label for="orgColor">Color</Label>
					<div class="flex gap-2">
						<Input id="orgColor" type="color" bind:value={newOrgColor} class="h-10 w-14 p-1" />
						<Input bind:value={newOrgColor} class="w-28 font-mono" required />
					</div>
				</div>
				<div class="space-y-2">
					<Label for="orgAvatarLabel">Avatar label</Label>
					<Input
						id="orgAvatarLabel"
						bind:value={newOrgAvatarLabel}
						placeholder="e.g. RE"
						maxlength={2}
						minlength={2}
						pattern="[A-Za-z][A-Za-z]"
						required
						class="w-20 font-mono uppercase"
					/>
				</div>
			</div>
			{#if freePalette.length > 0}
				<div class="space-y-2">
					<p class="text-xs text-muted-foreground">Suggestions</p>
					<div class="flex flex-wrap gap-2">
						{#each freePalette as suggestion (suggestion)}
							<button
								type="button"
								title="Use {suggestion}"
								onclick={() => (newOrgColor = suggestion)}
								class="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 {newOrgColor.toLowerCase() ===
								suggestion
									? 'border-foreground'
									: 'border-transparent'}"
								style={`background-color: ${suggestion};`}
							></button>
						{/each}
					</div>
				</div>
			{/if}
			{#if identityInUse.length > 0}
				<div class="space-y-2">
					<p class="text-xs text-muted-foreground">
						Already taken — every color, label and prefix can only be used once:
					</p>
					<div class="flex flex-wrap gap-2">
						{#each identityInUse as org (org.id)}
							<span
								class="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-xs"
								title={org.color}
							>
								<span
									class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
									style={`background-color: ${org.color}; color: ${getContrastingTextColor(org.color)};`}
								>
									{org.avatarLabel}
								</span>
								<span class="font-mono">{org.assetIdPrefix}</span>
								{#if org.name}
									<span class="text-muted-foreground">{org.name}</span>
								{/if}
							</span>
						{/each}
					</div>
				</div>
			{/if}
			<p class="text-xs text-muted-foreground">
				Color and a 2-letter label identify this org at a glance in the calendar and device lists.
			</p>
		</form>
	{/snippet}
	{#snippet description()}
		Create a new organization to manage assets and productions.
	{/snippet}
	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (createOpen = false)}
			disabled={creating}
		>
			Cancel
		</Button>
		<Button icon="add" type="submit" form="create-org-form" disabled={creating}>
			{creating ? 'Creating...' : 'Create Organization'}
		</Button>
	{/snippet}
</Modal>
