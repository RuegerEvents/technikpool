<script module lang="ts">
	import type { Prisma } from '$lib/prisma/client';

	export type StoredPort = Prisma.ProductPortGetPayload<{ include: { connector: true } }>;

	/**
	 * One line of the form. `name` rides along with the id so a connector created
	 * from the picker shows at once, before the catalogue refresh that lists it
	 * has landed. `autoLabel` is the label this form filled in by itself, so a
	 * later pick can replace it without ever touching one somebody typed.
	 */
	export type PortDraft = {
		key: number;
		connectorId: string;
		name: string;
		count: number | null;
		label: string;
		autoLabel: string;
	};

	let nextKey = 0;

	export function portDraft(port?: StoredPort): PortDraft {
		return {
			key: nextKey++,
			connectorId: port?.connectorId ?? '',
			name: port?.connector.name ?? '',
			count: port?.count ?? 1,
			label: port?.label ?? '',
			autoLabel: ''
		};
	}

	export function portDraftsFrom(ports: readonly StoredPort[]): PortDraft[] {
		return ports.map((p) => portDraft(p));
	}

	/** The form → what `setProductPorts` is sent. A line with no connector is not a line. */
	export function portInputsFrom(drafts: readonly PortDraft[]) {
		return drafts
			.filter((d) => d.connectorId)
			.map((d) => ({
				connectorId: d.connectorId,
				count: Math.max(1, Math.round(d.count ?? 1)),
				label: d.label.trim() || null
			}));
	}

	/** Whether the form still says what is stored. Order counts, as it does on the server. */
	export function portsUnchanged(drafts: readonly PortDraft[], stored: readonly StoredPort[]) {
		const next = portInputsFrom(drafts);
		return (
			next.length === stored.length &&
			next.every(
				(p, i) =>
					p.connectorId === stored[i].connectorId &&
					p.count === stored[i].count &&
					p.label === (stored[i].label ?? null)
			)
		);
	}
</script>

<script lang="ts">
	// The connectors built into a device — what its panel has, so nobody has to
	// unpack the case to find out whether it takes powerCON or Schuko. Per
	// product: every unit of a model has the same panel, so it is entered once.
	// Controlled: the surrounding product form saves it with everything else.
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { ConnectorFormModal } from '$lib/components/ui/connector-form-modal';
	import { getConnectors } from '$lib/remote/connectors.remote';
	import { portLabelSuggestions } from '$lib/ports';

	type Props = {
		rows: PortDraft[];
		/** The product's department — an XLR on a Light product is DMX. */
		productCategoryId: string;
		categories: { id: string; cableInputGender?: string | null }[];
		disabled?: boolean;
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
	};

	let {
		rows = $bindable([]),
		productCategoryId,
		categories,
		disabled = false,
		idPrefix = 'ports'
	}: Props = $props();

	let connectorsQuery = $derived(getConnectors());
	let connectors = $derived(connectorsQuery.current ?? []);

	// A device usually has each connector once — a DMX In and a DMX Out are two
	// different connectors. So what the other lines already use moves to the
	// bottom of the list, greyed, but stays choosable: a mixer with sixteen XLR
	// inputs and eight XLR returns is still two lines of XLR3 F.
	function optionsFor(row: PortDraft) {
		const used = new Set(rows.filter((r) => r !== row).map((r) => r.connectorId));
		const fresh = connectors.filter((c) => !used.has(c.id));
		const again = connectors
			.filter((c) => used.has(c.id))
			.map((c) => ({ ...c, group: 'Already added', muted: true }));
		return [...fresh, ...again];
	}

	type ConnectorRow = {
		name: string;
		family?: string | null;
		gender?: string | null;
		categoryId?: string | null;
	};

	function suggestionsFor(row: PortDraft, fresh?: ConnectorRow) {
		const connector = fresh ?? connectors.find((c) => c.id === row.connectorId);
		return connector
			? portLabelSuggestions(connector, productCategoryId, categories)
			: { labels: [], preferred: null };
	}

	function pick(
		row: PortDraft,
		sel: { id: string | null; name: string } | null,
		/** A row just saved, whose catalogue refresh may not have landed yet. */
		fresh?: ConnectorRow
	) {
		row.connectorId = sel?.id ?? '';
		row.name = sel?.name ?? '';
		// Fill in the label where it is knowable — "DMX In" for an XLR5 M on a
		// fixture — but only into a field nobody has written in. A label this
		// form filled in itself is fair game for the next pick.
		const { preferred } = suggestionsFor(row, fresh);
		if (!row.label.trim() || row.label === row.autoLabel) {
			row.label = preferred ?? '';
			row.autoLabel = preferred ?? '';
		}
	}

	function addRow() {
		rows.push(portDraft());
	}

	function removeRow(key: number) {
		rows = rows.filter((r) => r.key !== key);
	}

	// Which row the create modal was opened from, so the new connector lands
	// there. null means it is closed.
	let creatingFor = $state<number | null>(null);
	let creatingName = $state('');
	let connectorModalOpen = $state(false);

	function openConnectorModal(key: number, name: string) {
		creatingFor = key;
		creatingName = name;
		connectorModalOpen = true;
	}
</script>

<div class="space-y-2">
	{#if rows.length === 0}
		<p class="text-sm text-muted-foreground">No connectors recorded for this device yet.</p>
	{/if}
	<!-- One line per connector, in the order the list reads: "2 × XLR5 M  DMX In".
	     Flex rather than a grid, so no cell can be auto-placed into the wrong
	     column. -->
	{#each rows as r (r.key)}
		{@const labels = suggestionsFor(r).labels}
		<div class="flex items-center gap-2">
			<Input
				id="{idPrefix}-count-{r.key}"
				type="number"
				min="1"
				max="999"
				aria-label="Count"
				class="w-16 shrink-0 text-right tabular-nums"
				{disabled}
				bind:value={r.count}
			/>
			<span class="shrink-0 text-sm text-muted-foreground">×</span>
			<CreatableSelect
				class="min-w-0 flex-1"
				items={optionsFor(r)}
				value={r.connectorId ? { id: r.connectorId, name: r.name } : null}
				onchange={(sel) => pick(r, sel)}
				oncreate={(name) => openConnectorModal(r.key, name)}
				{disabled}
				showImages
				placeholder="XLR3 F…"
			/>
			<Input
				aria-label="Label"
				class="min-w-0 flex-1"
				placeholder="Label (optional)"
				list={labels.length > 0 ? `${idPrefix}-labels-${r.key}` : undefined}
				{disabled}
				bind:value={r.label}
			/>
			{#if labels.length > 0}
				<datalist id="{idPrefix}-labels-{r.key}">
					{#each labels as label (label)}<option value={label}></option>{/each}
				</datalist>
			{/if}
			<Button
				icon="close"
				variant="ghost"
				size="icon"
				class="shrink-0"
				aria-label="Remove"
				{disabled}
				onclick={() => removeRow(r.key)}
			/>
		</div>
	{/each}
	{#if !disabled}
		<Button icon="add" variant="outline" size="sm" onclick={addRow}>Add connector</Button>
	{/if}
</div>

<!-- Outside the rows on purpose: closing the modal must not depend on the row
     that opened it still being rendered. -->
<ConnectorFormModal
	bind:open={connectorModalOpen}
	initialName={creatingName}
	idPrefix="{idPrefix}-connector"
	onSaved={(saved) => {
		const target = rows.find((r) => r.key === creatingFor);
		if (target) pick(target, saved, saved);
		creatingFor = null;
	}}
/>
