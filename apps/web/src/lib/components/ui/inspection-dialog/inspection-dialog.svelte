<script lang="ts">
	import { EQUIPMENT_VIEWS } from '#lib/equipment-views.js';
	// Recording an inspection of one type: one unit from its page or the
	// inspections list, or a whole selection from the Devices list. The next due
	// date is never entered here — it follows from the result and the unit's
	// interval for that type.
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import {
		getInspectionTypes,
		getMyQualifications,
		logInspection
	} from '#lib/remote/inspections.remote.js';
	import { inspectionTypeLabel, localToday } from '#lib/inspection-ui.svelte.js';
	import { DEFAULT_INSPECTION_TYPE_ID } from '#lib/inspection-due.js';
	import { assetStatusLabel } from '#lib/components/ui/asset-status/asset-status.svelte.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';

	type Props = {
		open: boolean;
		assetIds: string[];
		/** What is being inspected — a unit's name, or nothing for a selection. */
		subject?: string;
		/** The type to start with; the dialog still lets it be changed. Electrical if absent. */
		typeId?: string;
		ondone?: () => void;
	};

	let { open = $bindable(false), assetIds, subject, typeId, ondone }: Props = $props();

	let typesQuery = $derived(getInspectionTypes());
	let types = $derived(typesQuery.current ?? []);
	let pickedTypeId = $state<string>(DEFAULT_INSPECTION_TYPE_ID);
	let pickedType = $derived(types.find((t) => t.id === pickedTypeId));
	let failLabel = $derived(assetStatusLabel(pickedType?.failStatus ?? 'BROKEN'));

	// A type that needs a qualification is recorded by someone who has one, or
	// entered as an outside firm's inspection with the firm's details. The
	// server checks the unit's org; this only decides what the form offers.
	let qualificationsQuery = $derived(getMyQualifications());
	let myQualifications = $derived(qualificationsQuery.current ?? []);
	let needsQualification = $derived(!!pickedType?.requiresQualification);
	let qualified = $derived(myQualifications.some((q) => q.typeId === pickedTypeId));
	let external = $state(false);
	let externalForced = $derived(needsQualification && !qualified);
	let isExternal = $derived(external || externalForced);
	let qualification = $state('');

	// The inspector is usually the same firm all day, so the last name is kept.
	const INSPECTOR_KEY = 'technikpool.inspectorName';

	let performedAt = $state(localToday());
	let result = $state<'PASSED' | 'FAILED'>('PASSED');
	let inspectorName = $state('');
	let notes = $state('');
	let saving = $state(false);

	$effect(() => {
		if (!open) return;
		pickedTypeId = typeId ?? DEFAULT_INSPECTION_TYPE_ID;
		external = false;
		qualification = '';
		performedAt = localToday();
		result = 'PASSED';
		notes = '';
		inspectorName = '';
		try {
			inspectorName = localStorage.getItem(INSPECTOR_KEY) ?? '';
		} catch {
			// Storage blocked: the field simply starts empty.
		}
	});

	async function save(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			const outcome = await logInspection({
				assetIds,
				typeId: pickedTypeId,
				external: isExternal,
				qualification: isExternal ? qualification || undefined : undefined,
				performedAt,
				result,
				inspectorName: isExternal ? inspectorName || undefined : undefined,
				notes: notes || undefined
			}).updates(...EQUIPMENT_VIEWS);
			if (isExternal && inspectorName.trim()) {
				try {
					localStorage.setItem(INSPECTOR_KEY, inspectorName.trim());
				} catch {
					// Not remembered; nothing else depends on it.
				}
			}
			toast.success(
				outcome.markedBroken > 0
					? plural(outcome.markedBroken, [
							`Inspection recorded · 1 unit set to ${failLabel}`,
							`Inspections recorded · # units set to ${failLabel}`
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
				<Label for="inspection-type">Inspection type</Label>
				<select
					id="inspection-type"
					bind:value={pickedTypeId}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
				>
					{#each types as type (type.id)}
						<option value={type.id}>{inspectionTypeLabel(type)}</option>
					{/each}
				</select>
			</div>
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
							? `The units are set to “${failLabel}” and stay due until a passed inspection is recorded.`
							: `The unit is set to “${failLabel}” and stays due until a passed inspection is recorded.`}
					</p>
				{/if}
			</div>
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={external} disabled={externalForced} />
					Inspected by an outside firm
				</label>
				{#if externalForced}
					<p class="text-xs text-muted-foreground">
						You hold no qualification for this type, so you can only enter an outside firm's
						inspection. Qualifications are recorded with the members of the organization.
					</p>
				{/if}
			</div>
			{#if isExternal}
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="inspection-inspector">Firm or inspector</Label>
						<Input
							id="inspection-inspector"
							bind:value={inspectorName}
							placeholder="e.g. TÜV Nord"
							required={needsQualification}
						/>
					</div>
					<div class="space-y-2">
						<Label for="inspection-qualification">Their qualification</Label>
						<Input
							id="inspection-qualification"
							bind:value={qualification}
							placeholder="e.g. Elektrofachkraft"
							required={needsQualification}
						/>
					</div>
				</div>
			{:else}
				<p class="text-xs text-muted-foreground">
					{#if needsQualification}
						Recorded under your name and qualification: {myQualifications.find(
							(q) => q.typeId === pickedTypeId
						)?.title ?? ''}
					{:else}
						Recorded under your name.
					{/if}
				</p>
			{/if}
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
