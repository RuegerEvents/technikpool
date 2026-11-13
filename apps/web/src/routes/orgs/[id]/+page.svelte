<script lang="ts">
	import { getErrorMessage } from '#lib/utils.js';
	import { DEFAULT_ORG_ROLE, ORG_ROLES, type OrgRole } from '#lib/roles.js';
	import { roleName, roleSummary } from '#lib/role-descriptions.svelte.js';
	import {
		InvitationLink,
		InvitationList,
		type IssuedInvitation
	} from '#lib/components/ui/invitations/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import {
		getOrgWithMembers,
		addUserToOrg,
		removeUserFromOrg,
		updateMemberRole
	} from '#lib/remote/orgs.remote.js';
	import { getInspectionTypes, getOrgQualifications } from '#lib/remote/inspections.remote.js';
	import { inspectionTypeLabel } from '#lib/inspection-ui.svelte.js';
	import { confirmAction } from '#lib/confirm.svelte.js';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import QualificationDialog from './qualification-dialog.svelte';
	import { orgAccess } from './org-access.js';

	// The Members tab: who is in, with which role and qualifications. The
	// layout around it holds the org's name and the tabs.

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let org = $derived(orgQuery.current);
	let access = $derived(orgAccess(org, data.user?.id, !!data.isAdmin));

	let inspectionTypesQuery = $derived(getInspectionTypes());
	let inspectionTypes = $derived(inspectionTypesQuery.current ?? []);
	// Who may record which inspection types here; ADMIN+ maintains them.
	let qualificationsQuery = $derived(getOrgQualifications(orgId));
	let qualifications = $derived(qualificationsQuery.current ?? []);
	let qualifiableTypes = $derived(inspectionTypes.filter((t) => t.requiresQualification));
	let qualifyTarget = $state<{ id: string; name: string } | null>(null);
	let qualifyOpen = $state(false);
	function qualificationsOf(membershipId: string) {
		return qualifications.filter((q) => q.membershipId === membershipId);
	}

	let addOpen = $state(false);
	let addEmail = $state('');
	let addRole = $state<OrgRole>(DEFAULT_ORG_ROLE);
	let adding = $state(false);
	let issued = $state<IssuedInvitation | null>(null);

	function openAdd() {
		addEmail = '';
		addRole = DEFAULT_ORG_ROLE;
		issued = null;
		addOpen = true;
	}

	async function handleAddUser(e: Event) {
		e.preventDefault();
		if (!addEmail) return;
		adding = true;
		try {
			const result = await addUserToOrg({ orgId, email: addEmail, role: addRole });
			if (result.status === 'invited') {
				// No account by that address yet, so the server sent an invitation
				// into this org instead; the dialog shows its link.
				issued = { email: addEmail, url: result.url, mailed: result.mailed };
			} else {
				toast.success(`${addEmail} added to organization`);
				addOpen = false;
			}
			addEmail = '';
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			adding = false;
		}
	}

	async function handleRemove(userId: string, name: string) {
		const ok = await confirmAction({
			title: `Remove ${name}?`,
			description: 'They lose access to this organization at once. You can add them again later.',
			confirmLabel: 'Remove',
			destructive: true
		});
		if (!ok) return;
		try {
			await removeUserFromOrg({ orgId, userId });
			toast.success(`${name} removed from organization`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function handleRoleChange(userId: string, role: string) {
		try {
			await updateMemberRole({ orgId, userId, role: role as OrgRole });
			toast.success('Role updated');
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}
</script>

<svelte:head><title>{org?.name ?? ''} | Technikpool</title></svelte:head>

{#if org}
	<div class="space-y-6">
		<Card.Root>
			<Card.Header class="flex flex-row flex-wrap items-start justify-between gap-3">
				<div class="space-y-1.5">
					<Card.Title>Members ({org.members.length})</Card.Title>
					<!-- The roles are a ladder: each one carries everything below it. Folded
					     away, since it is looked up rather than read every time. -->
					<details class="text-sm">
						<summary class="cursor-pointer text-muted-foreground hover:text-foreground"
							>What do the roles mean?</summary
						>
						<dl class="mt-2 space-y-1.5">
							{#each ORG_ROLES as role (role)}
								<div class="grid gap-x-3 sm:grid-cols-[6rem_1fr]">
									<dt class="font-medium">{roleName(role)}</dt>
									<dd class="text-muted-foreground">{roleSummary(role)}</dd>
								</div>
							{/each}
						</dl>
					</details>
				</div>
				{#if access.canManage}
					<Button icon="add" onclick={openAdd}>Add member</Button>
				{/if}
			</Card.Header>
			<Card.Content class="p-0">
				<ul class="divide-y border-t">
					{#each org.members as membership (membership.id)}
						{@const name = membership.user.name || membership.user.email}
						<li class="flex flex-wrap items-center gap-3 px-6 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<p class="truncate font-medium">{name}</p>
									{#if membership.user.isAdmin}
										<span
											class="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
										>
											System Admin
										</span>
									{/if}
								</div>
								{#if membership.user.name}
									<p class="truncate text-sm text-muted-foreground">{membership.user.email}</p>
								{/if}
								{#if qualificationsOf(membership.id).length > 0}
									<div class="mt-1 flex flex-wrap gap-1">
										{#each qualificationsOf(membership.id) as q (q.typeId)}
											{@const type = inspectionTypes.find((t) => t.id === q.typeId)}
											{@const lapsed = !!q.validUntil && new Date(q.validUntil) < new Date()}
											<span
												class="rounded border px-1.5 py-0.5 text-xs {lapsed
													? 'border-destructive/40 text-destructive'
													: 'text-muted-foreground'}"
												title={q.validUntil
													? `Valid until ${new Date(q.validUntil).toLocaleDateString('de-DE', { timeZone: 'UTC' })}`
													: undefined}
											>
												{q.title}{type ? ` · ${inspectionTypeLabel(type)}` : ''}{lapsed
													? ' · lapsed'
													: ''}
											</span>
										{/each}
									</div>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								{#if access.canInventory && qualifiableTypes.length > 0}
									<Button
										variant="outline"
										size="sm"
										onclick={() => {
											qualifyTarget = { id: membership.id, name };
											qualifyOpen = true;
										}}
									>
										Qualifications
									</Button>
								{/if}
								{#if access.canManage && membership.userId !== data.user?.id}
									<select
										value={membership.role}
										onchange={(e) =>
											handleRoleChange(membership.userId, (e.target as HTMLSelectElement).value)}
										aria-label="Role"
										class="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										{#each ORG_ROLES as role (role)}
											<option value={role} title={roleSummary(role)}>{roleName(role)}</option>
										{/each}
									</select>
									<Button
										icon="delete"
										variant="ghost"
										size="sm"
										aria-label="Remove {name}"
										onclick={() => handleRemove(membership.userId, name)}
									/>
								{:else}
									<span class="text-sm text-muted-foreground">{roleName(membership.role)}</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>

		{#if access.canManage}
			<Card.Root>
				<Card.Header>
					<Card.Title>Open invitations</Card.Title>
					<Card.Description>
						People invited by email who have not created their account yet.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<InvitationList organizationId={orgId} onissued={(result) => (issued = result)} />
					{#if issued && !addOpen}
						<div class="mt-4">
							<InvitationLink {issued} onclose={() => (issued = null)} />
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
{/if}

<Modal bind:open={addOpen} title="Add member" dismissible={!adding}>
	{#snippet children()}
		{#if issued}
			<InvitationLink {issued} onclose={() => (issued = null)} />
		{:else}
			<form id="add-member" onsubmit={handleAddUser} class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Add someone by email. If they have no account yet, they get an invitation to create one
					and join this organization.
				</p>
				<div class="space-y-2">
					<Label for="addEmail">Email address</Label>
					<Input
						id="addEmail"
						type="email"
						bind:value={addEmail}
						placeholder="user@example.com"
						required
					/>
				</div>
				<div class="space-y-2">
					<Label for="addRole">Role</Label>
					<select
						id="addRole"
						bind:value={addRole}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						{#each ORG_ROLES as role (role)}
							<option value={role}>{roleName(role)}</option>
						{/each}
					</select>
					<p class="text-sm text-muted-foreground">{roleSummary(addRole)}</p>
				</div>
			</form>
		{/if}
	{/snippet}
	{#snippet footer()}
		{#if issued}
			<Button onclick={() => (addOpen = false)}>Done</Button>
		{:else}
			<Button type="submit" form="add-member" disabled={adding}>
				{adding ? 'Adding…' : 'Add member'}
			</Button>
			<Button icon="close" variant="outline" disabled={adding} onclick={() => (addOpen = false)}>
				Cancel
			</Button>
		{/if}
	{/snippet}
</Modal>

{#if qualifyTarget}
	<QualificationDialog
		bind:open={qualifyOpen}
		membershipId={qualifyTarget.id}
		memberName={qualifyTarget.name}
		types={qualifiableTypes}
		current={qualificationsOf(qualifyTarget.id)}
	/>
{/if}
