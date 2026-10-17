<script lang="ts">
	// Recording a DGUV inspection: one unit from its page or the inspections
	// list, or a whole selection from the Devices list. The next due date is
	// never entered here — it follows from the result and the unit's interval.
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { logInspection } from '#lib/remote/inspections.remote.js';
	import { localToday } from '#lib/inspection-ui.svelte.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';

	type Props = {
		open: boolean;
		assetIds: string[];
		/** What is being inspected — a unit's name, or nothing for a selection. */
		subject?: string;
		ondone?: () => void;
	};

	let { open = $bindable(false), assetIds, subject, ondone }: Props = $props();

	// The inspector is usually the same firm all day, so the last name is kept.
	const INSPECTOR_KEY = 'technikpool.inspectorName';

	let performedAt = $state(localToday());
	let result = $state<'PASSED' | 'FAILED'>('PASSED');
	let inspectorName = $state('');
	let notes = $state('');
	let saving = $state(false);

	$effect(() => {
		if (!open) return;
		performedAt = localToday();
		result = 'PASSED';
		notes = '';
		inspectorName = localStorage.getItem(INSPECTOR_KEY) ?? '';
	});

	async function save(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			const outcome = await logInspection({
				assetIds,
				performedAt,
				result,
				inspectorName: inspectorName || undefined,
				notes: notes || undefined
			});
			if (inspectorName.trim()) localStorage.setItem(INSPECTOR_KEY, inspectorName.trim());
			toast.success(
				outcome.markedBroken > 0
					? plural(outcome.markedBroken, [
							'Inspection recorded · 1 unit marked broken',
							'Inspections recorded · # units marked broken'
						])
					: plural(outcome.count, ['Inspection recorded', '# inspections recorded'])
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
	title={assetIds.length > 1
		? plural(assetIds.length, ['Record inspection', 'Record inspection for # units'])
		: 'Record inspection'}
	dismissible={!saving}
>
	{#snippet children()}
		<form id="inspection-form" class="space-y-4" onsubmit={save}>
			<div class="space-y-2">
				<Label for="inspection-date">Inspected on</Label>
				<Input
					id="inspection-date"
					type="date"
					max={localToday()}
					bind:value={performedAt}
					required
				/>
				<p class="text-xs text-muted-foreground">
					An earlier inspection can be entered too — the next due date follows from the latest one.
				</p>
			</div>
			<div class="space-y-2">
				<Label for="inspection-result">Result</Label>
				<select
					id="inspection-result"
					bind:value={result}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
				>
					<option value="PASSED">Passed</option>
					<option value="FAILED">Failed</option>
				</select>
				{#if result === 'FAILED'}
					<p class="text-xs text-destructive">
						{assetIds.length > 1
							? 'The units are marked broken and stay due until a passed inspection is recorded.'
							: 'The unit is marked broken and stays due until a passed inspection is recorded.'}
					</p>
				{/if}
			</div>
			<div class="space-y-2">
				<Label for="inspection-inspector">Inspector</Label>
				<Input id="inspection-inspector" bind:value={inspectorName} placeholder="e.g. TÜV Nord" />
			</div>
			<div class="space-y-2">
				<Label for="inspection-notes">Notes</Label>
				<Input id="inspection-notes" bind:value={notes} placeholder="Optional" />
			</div>
		</form>
	{/snippet}
	{#snippet description()}
		{#if subject}{subject}{/if}
	{/snippet}
	{#snippet footer()}
		<Button icon="save" type="submit" form="inspection-form" disabled={saving}>
			{saving ? 'Saving…' : 'Record inspection'}
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
