<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import {
		getInvitations,
		resendInvitation,
		revokeInvitation
	} from '$lib/remote/invitations.remote';
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import { roleName } from '$lib/role-descriptions.svelte';
	import { toast } from 'svelte-sonner';
	import type { IssuedInvitation } from '.';

	/**
	 * Open invitations: one org's when `organizationId` is given, otherwise every
	 * one on the instance (system admins only). Read without awaiting — see
	 * CLAUDE.md, "Loading States" — so it never holds back the page around it.
	 */
	let {
		organizationId,
		onissued
	}: { organizationId?: string; onissued: (issued: IssuedInvitation) => void } = $props();

	let invitationsQuery = $derived(getInvitations(organizationId));
	let invitations = $derived(invitationsQuery.current ?? []);
	let busyId = $state<string | null>(null);

	async function resend(id: string) {
		busyId = id;
		try {
			onissued(await resendInvitation(id));
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busyId = null;
		}
	}

	async function revoke(id: string, email: string) {
		busyId = id;
		try {
			await revokeInvitation(id);
			toast.success(`Invitation for ${email} withdrawn`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busyId = null;
		}
	}
</script>

{#if !invitationsQuery.ready}
	<ContentSkeleton count={2} error={invitationsQuery.error} />
{:else if invitations.length === 0}
	<p class="text-sm text-muted-foreground">No open invitations.</p>
{:else}
	<ul class="divide-y rounded-md border text-sm">
		{#each invitations as invitation (invitation.id)}
			<li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
				<div class="min-w-0">
					<p class="truncate font-medium">{invitation.email}</p>
					<p class="text-xs text-muted-foreground">
						{#if invitation.organization && !organizationId}
							{orgLabel(invitation.organization)} ·
						{/if}
						{#if invitation.role}
							{roleName(invitation.role)} ·
						{/if}
						{#if invitation.expired}
							<span class="text-destructive">Expired</span>
						{:else}
							Valid until {new Date(invitation.expiresAt).toLocaleDateString()}
						{/if}
					</p>
				</div>
				<div class="flex gap-2">
					<Button
						icon="send"
						variant="outline"
						size="sm"
						disabled={busyId === invitation.id}
						onclick={() => resend(invitation.id)}
					>
						New link
					</Button>
					<Button
						variant="destructive"
						size="sm"
						disabled={busyId === invitation.id}
						onclick={() => revoke(invitation.id, invitation.email)}
					>
						Withdraw
					</Button>
				</div>
			</li>
		{/each}
	</ul>
{/if}
