<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { AddressInput, type AddressValue } from '$lib/components/ui/address-input';
	import { acceptDpa } from '$lib/remote/legal.remote';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';

	// Asks an organization's owner to accept the operator's data processing
	// agreement (see currentDpa in services/legal.ts) and doesn't let go until
	// they do: the operator may only process the organization's data under one.
	// Signing out is the way to not agree.
	let {
		pending,
		onsignout
	}: {
		pending: {
			orgs: { id: string; name: string; hasAddress: boolean }[];
			versionHash: string;
			html: string;
		};
		onsignout: () => void;
	} = $props();

	let open = $state(true);
	let authorized = $state(false);
	let accepting = $state(false);
	let orgNames = $derived(pending.orgs.map((o) => o.name).join(', '));

	// Organizations that are named as a party but have no address yet — a new
	// one, before anyone filled in its billing details.
	let missingAddress = $derived(pending.orgs.filter((o) => !o.hasAddress));
	const empty = (): AddressValue => ({ line1: '', line2: '', postalCode: '', city: '' });
	let addresses = $state<Record<string, AddressValue>>({});
	$effect.pre(() => {
		for (const org of missingAddress) addresses[org.id] ??= empty();
	});
	let addressesComplete = $derived(
		missingAddress.every((o) => {
			const a = addresses[o.id];
			return !!(a?.line1.trim() && a.postalCode.trim() && a.city.trim());
		})
	);

	async function accept() {
		if (!authorized || !addressesComplete || accepting) return;
		accepting = true;
		try {
			await acceptDpa({
				organizationIds: pending.orgs.map((o) => o.id),
				versionHash: pending.versionHash,
				addresses: Object.fromEntries(
					missingAddress.map((o) => [
						o.id,
						{
							line1: addresses[o.id].line1,
							line2: addresses[o.id].line2 || undefined,
							postalCode: addresses[o.id].postalCode,
							city: addresses[o.id].city
						}
					])
				)
			});
			toast.success('Agreement accepted');
			open = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			accepting = false;
			// Either way the layout is read again: after a success the dialog is
			// gone, after `dpa_outdated` it shows the current text.
			await invalidateAll();
		}
	}
</script>

<Modal bind:open title="Data processing agreement" size="full" dismissible={false}>
	<div class="space-y-4">
		<!-- Rendered by src/lib/server/markdown.ts, which escapes raw HTML and filters links. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<div class="legal-text rounded-md border p-4">{@html pending.html}</div>
		{#each missingAddress as org (org.id)}
			<div class="space-y-2 rounded-md border p-4">
				<p class="text-sm font-medium">Address of {org.name}</p>
				<p class="text-xs text-muted-foreground">
					The organization is a party to the agreement and needs an address. It is also saved as its
					billing address.
				</p>
				{#if addresses[org.id]}
					<AddressInput bind:value={addresses[org.id]} idPrefix="dpa-{org.id}" />
				{/if}
			</div>
		{/each}
		<label class="flex items-start gap-2 text-sm">
			<input type="checkbox" bind:checked={authorized} class="mt-0.5" />
			<span>
				I accept this agreement on behalf of <span class="font-medium">{orgNames}</span> and am authorized
				to do so.
			</span>
		</label>
	</div>
	{#snippet description()}
		This server processes personal data on behalf of your organization — its members, customers and
		crew. The law requires an agreement for that. As an owner, please read and accept it.
	{/snippet}
	{#snippet footer()}
		<Button onclick={accept} disabled={!authorized || !addressesComplete || accepting}>
			{accepting ? 'Saving…' : 'Accept'}
		</Button>
		<Button variant="outline" onclick={onsignout} disabled={accepting}>Sign out</Button>
	{/snippet}
</Modal>
