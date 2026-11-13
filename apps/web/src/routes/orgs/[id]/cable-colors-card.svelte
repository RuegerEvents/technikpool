<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import { CableColorLegend, CableColorSwatch } from '#lib/components/ui/cable-color/index.js';
	import { getCableColors, saveCableColors } from '#lib/remote/cable-colors.remote.js';
	import { CABLE_PALETTE, HEX_COLOR } from '#lib/cable-colors.js';
	import { paletteName } from '#lib/cable-colors.svelte.js';
	import { formatLength, parseLengthMeters } from '#lib/cable.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';

	// The org's cable colour code (docs/plans/kabelfarben.md): which colour of
	// tape marks which lengths. Everyone in the org sees it; ADMIN+ edits it, in
	// a dialog with an explicit Save since every list follows it at once.

	let { orgId, canEdit }: { orgId: string; canEdit: boolean } = $props();

	let schemeQuery = $derived(getCableColors(orgId));
	let bands = $derived(schemeQuery.current ?? []);

	/** One row of the editor. `colour` is a palette key or `own`. */
	type Draft = { length: string; colour: string; customName: string; customHex: string };

	let editing = $state(false);
	let saving = $state(false);
	let draft = $state<Draft[]>([]);

	const lengthText = (cm: number) => formatLength(cm).replace(/\s*m$/, '');

	function startEditing() {
		draft =
			bands.length > 0
				? bands.map((band) => ({
						length: lengthText(band.maxLengthCm),
						colour: band.paletteKey ?? 'own',
						customName: band.customName ?? '',
						customHex: band.customHex ?? '#888888'
					}))
				: [{ length: '', colour: 'red', customName: '', customHex: '#888888' }];
		editing = true;
	}

	function addRow() {
		const used = draft.map((row) => row.colour);
		const next = CABLE_PALETTE.find((colour) => !used.includes(colour.key))?.key ?? 'own';
		draft.push({ length: '', colour: next, customName: '', customHex: '#888888' });
	}

	/** What is wrong with a row, if anything, worded for the row itself. */
	function rowProblem(row: Draft): string | null {
		if (parseLengthMeters(row.length) === null) return 'Enter a length in metres.';
		if (row.colour === 'own' && !row.customName.trim()) return 'Give your colour a name.';
		if (row.colour === 'own' && !HEX_COLOR.test(row.customHex)) return 'Pick a colour value.';
		return null;
	}

	let problems = $derived(draft.map(rowProblem));
	let duplicate = $derived.by(() => {
		const lengths = draft
			.map((row) => parseLengthMeters(row.length))
			.filter((cm): cm is number => cm !== null);
		return lengths.find((cm, i) => lengths.indexOf(cm) !== i) ?? null;
	});

	async function save() {
		saving = true;
		try {
			await saveCableColors({
				organizationId: orgId,
				bands: draft.map((row) => ({
					maxLengthCm: parseLengthMeters(row.length)!,
					paletteKey: row.colour === 'own' ? null : row.colour,
					customName: row.colour === 'own' ? row.customName.trim() : null,
					customHex: row.colour === 'own' ? row.customHex : null
				}))
			});
			toast.success('Cable colours saved');
			editing = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

<Card.Root id="cable-colors" class="scroll-mt-20">
	<Card.Header>
		<Card.Title>Cable colours</Card.Title>
		<Card.Description>
			The colour of tape that marks each cable length. Shown next to every cable of yours, in the
			search, on packing lists and delivery notes, and to organizations that borrow from you.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-3">
		{#if !schemeQuery.ready}
			<ContentSkeleton shape="rows" count={3} error={schemeQuery.error} />
		{:else if bands.length === 0}
			<p class="text-sm text-muted-foreground">No colours set.</p>
		{:else}
			<CableColorLegend {bands} />
		{/if}
		{#if canEdit && schemeQuery.ready}
			<Button size="sm" variant="outline" class="w-full" onclick={startEditing}>
				{bands.length === 0 ? 'Set up colours' : 'Edit colours'}
			</Button>
		{/if}
	</Card.Content>
</Card.Root>

<Modal bind:open={editing} title="Cable colours" size="lg" dismissible={!saving}>
	{#snippet children()}
		<div class="space-y-3">
			<p class="text-sm text-muted-foreground">
				Each colour covers every length up to its own, from just past the colour before it. A cable
				longer than the last one has no colour.
			</p>
			{#each draft as row, i (i)}
				<div class="flex flex-wrap items-start gap-2 rounded-md border p-2">
					<label class="flex items-center gap-2 text-sm">
						<span class="text-muted-foreground">up to</span>
						<Input
							class="w-20"
							inputmode="decimal"
							bind:value={row.length}
							disabled={saving}
							aria-label="Length in metres"
						/>
						<span class="text-muted-foreground">m</span>
					</label>
					<div class="flex items-center gap-2">
						{#if row.colour === 'own'}
							<CableColorSwatch hex={row.customHex} name={row.customName} size="md" />
						{:else}
							{@const colour = CABLE_PALETTE.find((c) => c.key === row.colour)}
							{#if colour}
								<CableColorSwatch hex={colour.hex} name={paletteName(colour.key)} size="md" />
							{/if}
						{/if}
						<select
							class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							bind:value={row.colour}
							disabled={saving}
							aria-label="Colour"
						>
							{#each CABLE_PALETTE as colour (colour.key)}
								<option value={colour.key}>{paletteName(colour.key)}</option>
							{/each}
							<option value="own">Own colour…</option>
						</select>
					</div>
					{#if row.colour === 'own'}
						<Input
							class="w-36"
							placeholder="Name, e.g. neon yellow"
							bind:value={row.customName}
							disabled={saving}
							aria-label="Colour name"
						/>
						<input
							type="color"
							class="h-9 w-12 rounded-md border border-input bg-background"
							bind:value={row.customHex}
							disabled={saving}
							aria-label="Colour value"
						/>
					{/if}
					<Button
						icon="delete"
						size="sm"
						variant="ghost"
						class="ml-auto"
						disabled={saving}
						onclick={() => draft.splice(i, 1)}
						aria-label="Remove colour"
					/>
					{#if problems[i] && row.length !== ''}
						<p class="w-full text-xs text-destructive">{problems[i]}</p>
					{/if}
				</div>
			{/each}
			{#if duplicate !== null}
				<p class="text-sm text-destructive">
					Two colours end at {formatLength(duplicate)}. Each length can have only one colour.
				</p>
			{/if}
			<Button icon="add" size="sm" variant="outline" disabled={saving} onclick={addRow}>
				Add colour
			</Button>
		</div>
	{/snippet}
	{#snippet footer()}
		<Button
			icon="save"
			disabled={saving || problems.some(Boolean) || duplicate !== null}
			onclick={save}
		>
			{saving ? 'Saving…' : 'Save'}
		</Button>
		<Button icon="close" variant="outline" disabled={saving} onclick={() => (editing = false)}>
			Cancel
		</Button>
	{/snippet}
</Modal>
