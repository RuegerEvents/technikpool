<script lang="ts">
	import { EQUIPMENT_VIEWS } from '#lib/equipment-views.js';
	// A unit's own interval of one inspection type, for a selection of units —
	// the exception to what their org gives them for the product. Empty drops
	// it, so they follow the org again. Their due dates follow from the interval
	// and their latest inspections of that type, so there is no date to enter.
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { getInspectionTypes, setInspectionInterval } from '#lib/remote/inspections.remote.js';
	import { inspectionTypeLabel } from '#lib/inspection-ui.svelte.js';
	import { DEFAULT_INSPECTION_TYPE_ID } from '#lib/inspection-due.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';

	type Props = {
		open: boolean;
		assetIds: string[];
		/** The type to start with. Electrical if absent. */
		typeId?: string;
		/** The interval to start with — a single unit's own one, if it has one. */
		currentMonths?: number | null;
		ondone?: () => void;
	};

	let { open = $bindable(false), assetIds, typeId, currentMonths, ondone }: Props = $props();

	let typesQuery = $derived(getInspectionTypes());
	let types = $derived(typesQuery.current ?? []);
	let pickedTypeId = $state<string>(DEFAULT_INSPECTION_TYPE_ID);
	let months = $state('');
	let saving = $state(false);

	$effect(() => {
		if (!open) return;
		pickedTypeId = typeId ?? DEFAULT_INSPECTION_TYPE_ID;
		months = currentMonths ? String(currentMonths) : '';
	});

	async function save(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			const result = await setInspectionInterval({
				assetIds,
				typeId: pickedTypeId,
				intervalMonths: months ? Number(months) : null
			}).updates(...EQUIPMENT_VIEWS);
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
		<form id="interval-form" class="space-y-4" onsubmit={save}>
			<div class="space-y-2">
				<Label for="interval-type">Inspection type</Label>
				<select
					id="interval-type"
					bind:value={pickedTypeId}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
				>
					{#each types as type (type.id)}
						<option value={type.id}>{inspectionTypeLabel(type)}</option>
					{/each}
				</select>
			</div>
			<div class="space-y-2">
				<Label for="interval-months">Own interval (months)</Label>
				<Input id="interval-months" type="number" min="1" max="120" bind:value={months} />
				<p class="text-xs text-muted-foreground">
					Only for an exception: normally a device follows its organization's interval for the
					product or the type. Leave empty to follow it again. The next due date follows from the
					latest inspection of this type, or is due at once if there was none.
				</p>
			</div>
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
