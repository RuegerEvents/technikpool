<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { OrgBadge } from '#lib/components/ui/org-badge/index.js';
	import { getOrgWithMembers, getOrgIdentityInUse, updateOrg } from '#lib/remote/orgs.remote.js';
	import { messageForErrorCode } from '#lib/error-messages.svelte.js';
	import { orgIdentityProblem } from '#lib/org-identity.svelte.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { page } from '$app/state';
	import { refreshAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import OrgLogoCard from '../org-logo-card.svelte';
	import { orgAccess } from '../org-access.js';
	import { FormDraft } from '../form-draft.svelte.js';

	// The General tab: what the organization is called and how it looks. OWNER
	// only, like the tab itself.

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let org = $derived(orgQuery.current);
	let access = $derived(orgAccess(org, data.user?.id, !!data.isAdmin));

	// Colour and label are unique across every org — this org's own values don't count.
	let identityInUseQuery = $derived(getOrgIdentityInUse());
	let identityInUse = $derived((identityInUseQuery.current ?? []).filter((o) => o.id !== orgId));

	// The form is always open: the fields start at what is saved, and Save
	// lights up once something differs from it.
	const form = new FormDraft(
		() =>
			org
				? {
						name: org.name,
						shortName: org.shortName ?? '',
						color: org.color,
						avatarLabel: org.avatarLabel
					}
				: null,
		{ name: '', shortName: '', color: '#000000', avatarLabel: '' }
	);
	let saving = $state(false);

	let problem = $derived(
		org
			? orgIdentityProblem(
					{
						color: form.value.color,
						avatarLabel: form.value.avatarLabel,
						assetIdPrefix: org.assetIdPrefix
					},
					identityInUse
				)
			: null
	);

	async function save(e: Event) {
		e.preventDefault();
		if (!org) return;
		if (!form.value.name.trim()) {
			toast.error(messageForErrorCode('org_name_required'));
			return;
		}
		if (problem) {
			toast.error(problem);
			return;
		}
		saving = true;
		try {
			await updateOrg({
				orgId,
				name: form.value.name,
				shortName: form.value.shortName || null,
				assetIdPrefix: org.assetIdPrefix,
				color: form.value.color,
				avatarLabel: form.value.avatarLabel
			});
			toast.success('Organization settings updated');
			// The user menu shows the home org's label and colour from the layout.
			if (orgId === data.homeOrgId) await refreshAll();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>{org?.name ?? ''} | Technikpool</title></svelte:head>

{#if org && access.canManage}
	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Name and look</Card.Title>
				<Card.Description>How the organization is named and shown across the app.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form onsubmit={save} class="space-y-4">
					<div class="space-y-2">
						<Label for="nameInput">Name</Label>
						<Input id="nameInput" bind:value={form.value.name} required maxlength={120} />
						<p class="text-xs text-muted-foreground">
							The full name, printed on offers, invoices and delivery notes. Documents already
							issued keep the old one; drafts offer to take the new one.
						</p>
					</div>
					<div class="space-y-2">
						<Label for="shortNameInput"
							>Short name <span class="text-muted-foreground">(optional)</span></Label
						>
						<Input
							id="shortNameInput"
							bind:value={form.value.shortName}
							placeholder={form.value.name}
							maxlength={24}
						/>
						<p class="text-xs text-muted-foreground">
							Shown instead of the full name in tables and pickers. Invoices and offers always use
							the full name.
						</p>
					</div>
					<div class="flex flex-wrap items-end gap-4">
						<div class="space-y-2">
							<Label for="colorInput">Color</Label>
							<div class="flex gap-2">
								<Input
									id="colorInput"
									type="color"
									bind:value={form.value.color}
									class="h-10 w-14 p-1"
								/>
								<Input bind:value={form.value.color} class="w-28 font-mono" required />
							</div>
						</div>
						<div class="space-y-2">
							<Label for="avatarLabelInput">Avatar label</Label>
							<Input
								id="avatarLabelInput"
								bind:value={form.value.avatarLabel}
								maxlength={2}
								required
								class="w-20 font-mono uppercase"
							/>
						</div>
						<div class="pb-2">
							<OrgBadge
								name={form.value.shortName || form.value.name}
								color={form.value.color}
								avatarLabel={form.value.avatarLabel.toUpperCase()}
							/>
						</div>
					</div>
					{#if problem}
						<p class="text-xs text-destructive">{problem}</p>
					{/if}
					<div class="flex gap-2">
						<Button icon="save" type="submit" disabled={!form.dirty || saving || !!problem}>
							{saving ? 'Saving…' : 'Save'}
						</Button>
						{#if form.dirty}
							<Button type="button" variant="outline" disabled={saving} onclick={() => form.reset()}
								>Discard changes</Button
							>
						{/if}
					</div>
				</form>
			</Card.Content>
		</Card.Root>

		<OrgLogoCard {orgId} logoPath={org.logoPath} />
	</div>
{/if}
