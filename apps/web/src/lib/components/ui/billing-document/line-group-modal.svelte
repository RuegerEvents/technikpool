<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { groupBillingLines, updateBillingLineGroup } from '#lib/remote/offers.remote.js';
	import type { BillingLineGroup } from '#lib/billing-lines.js';
	import type { ServiceLineTarget } from './types';

	let {
		open = $bindable(false),
		target,
		keys,
		groups,
		renamed = null,
		onDone
	}: {
		open: boolean;
		target: ServiceLineTarget;
		/** The selected lines' products and kits, combined into one line. */
		keys: string[];
		/** The document's collective lines, any of which the selection may join. */
		groups: BillingLineGroup[];
		/** Set to rename that collective line instead. */
		renamed?: { id: string; label: string } | null;
		onDone: () => void;
	} = $props();

	let label = $state('');
	/** '' starts a new collective line. */
	let joinId = $state('');
	let saving = $state(false);

	$effect(() => {
		if (!open) return;
		label = renamed?.label ?? '';
		joinId = '';
	});

	let valid = $derived(joinId !== '' || label.trim() !== '');

	async function save(e: Event) {
		e.preventDefault();
		if (!valid) return;
		saving = true;
		const { kind, documentId } = target;
		try {
			if (renamed) {
				await updateBillingLineGroup({
					kind,
					documentId,
					groupId: renamed.id,
					label: label.trim()
				});
				toast.success('Collective line renamed');
			} else {
				await groupBillingLines({
					kind,
					documentId,
					keys,
					...(joinId ? { groupId: joinId } : { label: label.trim() })
				});
				toast.success('Lines combined');
			}
			onDone();
			open = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}

	const selectClass =
		'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none';
</script>

<Modal bind:open title={renamed ? 'Rename collective line' : 'Combine lines'} dismissible={!saving}>
	{#snippet children()}
		<form id="line-group-form" class="space-y-4" onsubmit={save}>
			{#if !renamed}
				<p class="text-sm text-muted-foreground">
					The PDF and the e-invoice show one line with the sum, and what is in it in small print
					underneath. Further units of these products join it when the document is updated from the
					production.
				</p>
				{#if groups.length > 0}
					<div class="space-y-2">
						<Label for="line-group-join">Combine into</Label>
						<select id="line-group-join" class={selectClass} bind:value={joinId}>
							<option value="">A new collective line</option>
							{#each groups as group (group.id)}
								<option value={group.id}>{group.label}</option>
							{/each}
						</select>
					</div>
				{/if}
			{/if}
			{#if renamed || joinId === ''}
				<div class="space-y-2">
					<Label for="line-group-label">Name</Label>
					<Input
						id="line-group-label"
						bind:value={label}
						placeholder="Cables and power distribution, for example"
						required
					/>
				</div>
			{/if}
		</form>
	{/snippet}

	{#snippet footer()}
		<Button icon="save" type="submit" form="line-group-form" disabled={saving || !valid}>
			{saving ? 'Saving…' : 'Save'}
		</Button>
		<Button icon="close" variant="outline" disabled={saving} onclick={() => (open = false)}>
			Cancel
		</Button>
	{/snippet}
</Modal>
