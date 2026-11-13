<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { getOrgWithMembers, deleteOrg } from '#lib/remote/orgs.remote.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { orgAccess } from '../org-access.js';

	// The Data & legal tab: the data processing agreement, the export of
	// everything, and deleting the organization. OWNER only.

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let org = $derived(orgQuery.current);
	let access = $derived(orgAccess(org, data.user?.id, !!data.isAdmin));
	let dpa = $derived(org?.dpaAcceptances[0] ?? null);

	let deleteOpen = $state(false);
	let deleting = $state(false);

	async function handleDelete() {
		if (deleting) return;
		deleting = true;
		try {
			await deleteOrg(orgId);
			toast.success('Organization deleted');
			await goto(resolve('orgs'));
		} catch (err) {
			toast.error(getErrorMessage(err));
			deleting = false;
		}
	}
</script>

<svelte:head><title>{org?.name ?? ''} | Technikpool</title></svelte:head>

{#if org && access.canManage}
	<div class="max-w-3xl space-y-6">
		{#if dpa}
			<Card.Root>
				<Card.Header>
					<Card.Title>Data processing agreement</Card.Title>
					<Card.Description>
						Accepted with the operator of this server on {new Date(
							dpa.acceptedAt
						).toLocaleDateString()}. The PDF shows who accepted which version, and when.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Button
						variant="outline"
						size="sm"
						href={resolve(`api/dpa-acceptances/${dpa.id}`)}
						target="_blank">Download PDF</Button
					>
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>Data export</Card.Title>
				<Card.Description>
					Download everything this organization owns — members, inventory, productions, offers and
					invoices including the archived PDFs — as one JSON file.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button icon="download" variant="outline" href={`/api/orgs/${orgId}/export`}>
					Export all data (JSON)
				</Button>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border-destructive/50">
			<Card.Header>
				<Card.Title class="text-destructive">Danger zone</Card.Title>
				<Card.Description>
					Deleting the organization removes it with all of its locations, devices, productions,
					offers and invoices. It cannot be undone — export the data first if you may need it.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button icon="delete" variant="destructive" onclick={() => (deleteOpen = true)}>
					Delete organization
				</Button>
			</Card.Content>
		</Card.Root>
	</div>
{/if}

<Modal bind:open={deleteOpen} title="Delete organization" dismissible={!deleting}>
	{#snippet children()}
		<p class="text-sm">
			Delete <span class="font-medium">{org?.name ?? ''}</span> and all of its data? This cannot be undone.
		</p>
	{/snippet}
	{#snippet footer()}
		<Button icon="delete" variant="destructive" onclick={handleDelete} disabled={deleting}>
			{deleting ? 'Deleting…' : 'Delete organization'}
		</Button>
		<Button icon="close" variant="outline" onclick={() => (deleteOpen = false)} disabled={deleting}
			>Cancel</Button
		>
	{/snippet}
</Modal>
