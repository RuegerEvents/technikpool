<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import {
		orgSnapshotDiff,
		type OrgSnapshotColumns,
		type OrgSnapshotDiffKey,
		type OrgSnapshotSource
	} from '$lib/org-snapshot';

	// Offers and invoices snapshot the issuing org's letterhead at creation.
	// When the live org has since changed, this hint appears — the snapshot
	// never follows the org on its own, updating it is an explicit choice, and
	// on a finalized document there is nothing to update, only to know.

	let {
		document,
		organization,
		editable,
		onUpdate
	}: {
		document: OrgSnapshotColumns;
		organization: OrgSnapshotSource;
		/** False once the document is finalized — the hint stays, the button goes. */
		editable: boolean;
		onUpdate: () => Promise<void>;
	} = $props();

	let diff = $derived(orgSnapshotDiff(document, organization));
	let working = $state(false);

	const labels: Record<OrgSnapshotDiffKey, string> = {
		name: 'Name',
		address: 'Address',
		taxId: 'Tax ID',
		contact: 'Contact details',
		bank: 'Bank details',
		vatStatus: 'VAT status'
	};

	async function handleUpdate() {
		working = true;
		try {
			await onUpdate();
			toast.success('Organization details updated on this document');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}
</script>

{#if diff.length > 0}
	<Card.Root class="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
		<Card.Content class="flex flex-wrap items-center justify-between gap-3 py-4">
			<div class="text-sm">
				<p class="font-medium text-amber-900 dark:text-amber-200">
					Organization details have changed
				</p>
				<p class="text-amber-800/80 dark:text-amber-300/80">
					{#if editable}
						This document still shows the organization's details as they were when it was created ({diff
							.map((key) => labels[key])
							.join(', ')}). Update it to use the current details.
					{:else}
						This document was issued with the organization's details of its time ({diff
							.map((key) => labels[key])
							.join(', ')} changed since). Issued documents keep what they said.
					{/if}
				</p>
			</div>
			{#if editable}
				<Button size="sm" disabled={working} onclick={handleUpdate}>
					{working ? 'Updating…' : 'Use current details'}
				</Button>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
