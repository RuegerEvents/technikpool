<script lang="ts">
	import { EQUIPMENT_VIEWS } from '#lib/equipment-views.js';
	// The inspection types, shared by every organization and kept by system
	// admins like categories. Which products need a type is set per category
	// and product; an org's interval per type in its settings. The default
	// interval here is for an org that has not set one of its own.
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import { assetStatusLabel } from '#lib/components/ui/asset-status/asset-status.svelte.js';
	import {
		createInspectionType,
		getInspectionTypes,
		updateInspectionType
	} from '#lib/remote/inspections.remote.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	const FAIL_STATUSES = ['BROKEN', 'MAINTENANCE', 'UNAVAILABLE', 'DECOMMISSIONED'] as const;
	type FailStatus = (typeof FAIL_STATUSES)[number];

	let typesQuery = $derived(getInspectionTypes());
	let types = $derived(typesQuery.current ?? []);
	type Type = (typeof types)[number];

	type Draft = {
		name: string;
		nameDe: string;
		failStatus: FailStatus;
		requiresQualification: boolean;
		hasMeasurements: boolean;
		defaultIntervalMonths: string;
		sortOrder: string;
	};
	let drafts = new SvelteMap<string, Draft>();
	let saving = new SvelteSet<string>();

	function draftFor(t: Type): Draft {
		return (
			drafts.get(t.id) ?? {
				name: t.name,
				nameDe: t.nameDe ?? '',
				failStatus: t.failStatus as FailStatus,
				requiresQualification: t.requiresQualification,
				hasMeasurements: t.hasMeasurements,
				defaultIntervalMonths: t.defaultIntervalMonths?.toString() ?? '',
				sortOrder: String(t.sortOrder)
			}
		);
	}

	function edit(t: Type, patch: Partial<Draft>) {
		drafts.set(t.id, { ...draftFor(t), ...patch });
	}

	function fields(d: Draft) {
		return {
			nameDe: d.nameDe || null,
			failStatus: d.failStatus,
			requiresQualification: d.requiresQualification,
			hasMeasurements: d.hasMeasurements,
			defaultIntervalMonths: d.defaultIntervalMonths ? Number(d.defaultIntervalMonths) : null,
			sortOrder: Number(d.sortOrder)
		};
	}

	async function save(t: Type) {
		const draft = drafts.get(t.id);
		if (!draft) return;
		saving.add(t.id);
		try {
			const result = await updateInspectionType({
				typeId: t.id,
				name: draft.name,
				...fields(draft)
			}).updates(...EQUIPMENT_VIEWS);
			drafts.delete(t.id);
			toast.success(
				result.unitsChanged > 0
					? plural(result.unitsChanged, ['Saved · 1 unit changed', 'Saved · # units changed'])
					: 'Inspection type saved'
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving.delete(t.id);
		}
	}

	const emptyDraft = (): Draft => ({
		name: '',
		nameDe: '',
		failStatus: 'BROKEN',
		requiresQualification: true,
		hasMeasurements: false,
		defaultIntervalMonths: '12',
		sortOrder: ''
	});
	let newDraft = $state<Draft>(emptyDraft());
	let creating = $state(false);

	async function create(e: Event) {
		e.preventDefault();
		creating = true;
		try {
			const { sortOrder, ...rest } = fields(newDraft);
			await createInspectionType({
				name: newDraft.name,
				...rest,
				...(newDraft.sortOrder ? { sortOrder } : {})
			});
			newDraft = emptyDraft();
			toast.success('Inspection type added');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			creating = false;
		}
	}

	const selectClass =
		'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none';
</script>

<svelte:head><title>Inspection types | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Inspection types</h1>
		<p class="text-muted-foreground">
			Shared by every organization. Which products need a type is set per category and on the
			product's page; an organization sets its own interval per type in its settings, and the
			default interval here applies where it has not. Only members qualified for a type that needs a
			qualification record it themselves — an outside firm's inspection can always be entered.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="space-y-3 pt-6">
			{#if !typesQuery.ready}
				<ContentSkeleton count={4} error={typesQuery.error} />
			{/if}
			{#each types as type (type.id)}
				{@const draft = draftFor(type)}
				{@const dirty = drafts.has(type.id)}
				<div
					class="grid items-end gap-3 border-b pb-3 last:border-0 last:pb-0 lg:grid-cols-[1fr_1fr_10rem_auto_6rem_5rem_auto]"
				>
					<div class="space-y-1">
						<Label for="name-{type.id}" class="text-xs">English name</Label>
						<Input
							id="name-{type.id}"
							value={draft.name}
							oninput={(e) => edit(type, { name: (e.target as HTMLInputElement).value })}
						/>
						<p class="font-mono text-xs text-muted-foreground">{type.key}</p>
					</div>
					<div class="space-y-1">
						<Label for="nameDe-{type.id}" class="text-xs">German name</Label>
						<Input
							id="nameDe-{type.id}"
							value={draft.nameDe}
							placeholder={type.name}
							oninput={(e) => edit(type, { nameDe: (e.target as HTMLInputElement).value })}
						/>
						<p class="text-xs">&nbsp;</p>
					</div>
					<div class="space-y-1">
						<Label for="fail-{type.id}" class="text-xs">Failed sets</Label>
						<select
							id="fail-{type.id}"
							value={draft.failStatus}
							onchange={(e) =>
								edit(type, {
									failStatus: (e.currentTarget as HTMLSelectElement).value as FailStatus
								})}
							class={selectClass}
						>
							{#each FAIL_STATUSES as status (status)}
								<option value={status}>{assetStatusLabel(status)}</option>
							{/each}
						</select>
						<p class="text-xs">&nbsp;</p>
					</div>
					<div class="space-y-1 text-sm">
						<label class="flex h-5 items-center gap-2 whitespace-nowrap">
							<input
								type="checkbox"
								checked={draft.requiresQualification}
								onchange={(e) =>
									edit(type, {
										requiresQualification: (e.currentTarget as HTMLInputElement).checked
									})}
							/>
							Needs a qualification
						</label>
						<label class="flex h-5 items-center gap-2 whitespace-nowrap">
							<input
								type="checkbox"
								checked={draft.hasMeasurements}
								onchange={(e) =>
									edit(type, { hasMeasurements: (e.currentTarget as HTMLInputElement).checked })}
							/>
							Measured values
						</label>
						<p class="text-xs">&nbsp;</p>
					</div>
					<div class="space-y-1">
						<Label for="interval-{type.id}" class="text-xs">Default (months)</Label>
						<Input
							id="interval-{type.id}"
							type="number"
							min="1"
							max="120"
							value={draft.defaultIntervalMonths}
							placeholder="—"
							oninput={(e) =>
								edit(type, { defaultIntervalMonths: (e.target as HTMLInputElement).value })}
						/>
						<p class="text-xs">&nbsp;</p>
					</div>
					<div class="space-y-1">
						<Label for="sort-{type.id}" class="text-xs">Order</Label>
						<Input
							id="sort-{type.id}"
							type="number"
							value={draft.sortOrder}
							oninput={(e) => edit(type, { sortOrder: (e.target as HTMLInputElement).value })}
							class="text-right"
						/>
						<p class="text-xs">&nbsp;</p>
					</div>
					<div class="space-y-1">
						<Button
							icon="save"
							variant="outline"
							disabled={!dirty || saving.has(type.id)}
							onclick={() => save(type)}
						>
							Save
						</Button>
						<p class="text-xs">&nbsp;</p>
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>New inspection type</Card.Title>
			<Card.Description>
				No product needs it until it is switched on for a category or a product.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				class="grid items-end gap-3 lg:grid-cols-[1fr_1fr_10rem_auto_6rem_auto]"
				onsubmit={create}
			>
				<div class="space-y-1">
					<Label for="new-name" class="text-xs">English name</Label>
					<Input
						id="new-name"
						bind:value={newDraft.name}
						placeholder="e.g. Ladder inspection"
						required
					/>
				</div>
				<div class="space-y-1">
					<Label for="new-nameDe" class="text-xs">German name</Label>
					<Input id="new-nameDe" bind:value={newDraft.nameDe} placeholder="e.g. Leiterprüfung" />
				</div>
				<div class="space-y-1">
					<Label for="new-fail" class="text-xs">Failed sets</Label>
					<select id="new-fail" bind:value={newDraft.failStatus} class={selectClass}>
						{#each FAIL_STATUSES as status (status)}
							<option value={status}>{assetStatusLabel(status)}</option>
						{/each}
					</select>
				</div>
				<div class="space-y-1 text-sm">
					<label class="flex h-5 items-center gap-2 whitespace-nowrap">
						<input type="checkbox" bind:checked={newDraft.requiresQualification} />
						Needs a qualification
					</label>
					<label class="flex h-5 items-center gap-2 whitespace-nowrap">
						<input type="checkbox" bind:checked={newDraft.hasMeasurements} />
						Measured values
					</label>
				</div>
				<div class="space-y-1">
					<Label for="new-interval" class="text-xs">Default (months)</Label>
					<Input
						id="new-interval"
						type="number"
						min="1"
						max="120"
						bind:value={newDraft.defaultIntervalMonths}
					/>
				</div>
				<Button icon="add" type="submit" disabled={creating || !newDraft.name.trim()}>Add</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
