<script lang="ts">
	// The inspection interval for a selection of units. Their due dates follow
	// from it and their latest inspections, so there is no date to enter.
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { setInspectionInterval } from '#lib/remote/inspections.remote.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';

	type Props = {
		open: boolean;
		assetIds: string[];
		ondone?: () => void;
	};

	let { open = $bindable(false), assetIds, ondone }: Props = $props();

	let months = $state('');
	let saving = $state(false);

	$effect(() => {
		if (open) months = '';
	});

	async function save(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			const result = await setInspectionInterval({
				assetIds,
				intervalMonths: months ? Number(months) : null
			});
			toast.success(
				result.updated === 0
					? 'Already set — nothing changed'
					: plural(result.updated, ['Interval set for 1 unit', 'Interval set for # units'])
			);
			open = false;
			ondone?.();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

<Modal
	bind:open
	title={plural(assetIds.length, [
		'Inspection interval for 1 unit',
		'Inspection interval for # units'
	])}
	dismissible={!saving}
>
	{#snippet children()}
		<form id="interval-form" class="space-y-2" onsubmit={save}>
			<Label for="interval-months">DGUV inspection interval (months)</Label>
			<Input id="interval-months" type="number" min="1" max="120" bind:value={months} />
			<p class="text-xs text-muted-foreground">
				The next due date of each unit follows from its latest inspection, or is due at once if it
				was never inspected. Leave empty to stop tracking the units.
			</p>
		</form>
	{/snippet}
	{#snippet footer()}
		<Button icon="save" type="submit" form="interval-form" disabled={saving}>
			{saving ? 'Saving…' : 'Save'}
		</Button>
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (open = false)}
			disabled={saving}
		>
			Cancel
		</Button>
	{/snippet}
</Modal>
