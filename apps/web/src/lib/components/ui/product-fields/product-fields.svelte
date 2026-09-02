<script module lang="ts">
	import {
		cableDisplayName,
		counterpartConnector,
		formatLength,
		isCable,
		parseLengthMeters,
		endsAreReversed,
		CABLE_END_LABEL,
		connectorRole,
		type CableAttrs,
		type CableEndRole,
		type CableInput,
		type ConnectorRow
	} from '$lib/cable';

	/**
	 * The cable half of the form. Length is a string rather than a number because
	 * `type="number"` refuses a comma in Safari, and metres are typed with one
	 * here.
	 */
	export type CableDraft = {
		cableType: string;
		connectorA: string;
		connectorB: string;
		lengthM: string;
	};

	export type ProductDraft = {
		name: string;
		categoryId: string;
		imagePath: string;
		/**
		 * Number inputs bind as numbers and use undefined for an empty field.
		 * Prices are per-org: whichever org the surrounding form is acting for
		 * is whose price this is.
		 */
		netPurchasePrice: number | undefined;
		/** null means "not a cable" — the four columns stay null on the row. */
		cable: CableDraft | null;
	};

	/** A stored product → the form. Null for anything that is not a cable. */
	export function cableDraftFrom(p: CableAttrs): CableDraft | null {
		if (!p.cableType) return null;
		return {
			cableType: p.cableType,
			connectorA: p.connectorA ?? '',
			connectorB: p.connectorB ?? '',
			// Round-trips through the same fixed-locale formatting the derived name
			// uses, so reopening a form and saving it unchanged writes nothing.
			lengthM: p.lengthCm ? formatLength(p.lengthCm).replace(/\s*m$/, '') : ''
		};
	}

	/** The form → what `updateProduct` / `createAssets` are sent. */
	export function cableInputFrom(d: CableDraft | null): CableInput | null {
		if (!d) return null;
		const input: CableInput = {
			cableType: d.cableType.trim() || null,
			connectorA: d.connectorA.trim() || null,
			connectorB: d.connectorB.trim() || null,
			lengthCm: parseLengthMeters(d.lengthM)
		};
		// Null when the draft says nothing at all: ticking "this is a cable" and
		// filling none of it in leaves an ordinary product, not four empty columns.
		return isCable(input) ? input : null;
	}

	/** The name a cable draft would get if nobody had written a better one. */
	function derivedName(cable: CableDraft | null, connectors: readonly ConnectorRow[]): string {
		if (!cable) return '';
		return cableDisplayName(
			{
				cableType: cable.cableType,
				connectorA: cable.connectorA,
				connectorB: cable.connectorB,
				lengthCm: parseLengthMeters(cable.lengthM)
			},
			connectors
		);
	}
</script>

<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { ImageUpload } from '$lib/components/ui/image-upload';
	import { ConnectorFormModal } from '$lib/components/ui/connector-form-modal';
	import { getCableVocabulary } from '$lib/remote/assets.remote';
	import { getConnectors } from '$lib/remote/connectors.remote';

	type Props = {
		value?: ProductDraft;
		categories: {
			id: string;
			name: string;
			color: string;
			/** Which contacts feed, on a cable in this department. See endsAreReversed. */
			cableInputGender?: string | null;
		}[];
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
		/** Hide the price field where the page renders its own per-org price inputs. */
		showPrice?: boolean;
		/**
		 * Grey out name, category and the cable fields when the server would refuse
		 * to change them — a product whose units belong to an org the user doesn't
		 * admin. What a cable is counts as identity for the same reason a name
		 * does: it decides which product a unit belongs to.
		 */
		identityDisabled?: boolean;
	};

	let {
		value = $bindable({
			name: '',
			categoryId: '',
			imagePath: '',
			netPurchasePrice: undefined,
			cable: null
		}),
		categories,
		idPrefix = 'product',
		showPrice = true,
		identityDisabled = false
	}: Props = $props();

	// Only loaded once the box is ticked: a form for a moving head has no use for
	// the cable vocabulary, and every page carrying ProductFields would pay for it.
	let vocab = $derived(value.cable ? await getCableVocabulary() : null);
	let connectors = $derived(value.cable ? await getConnectors() : []);

	let typeItems = $derived((vocab?.types ?? []).map((name) => ({ id: name, name })));

	// The connector list, arranged for the slot it is filling: this end's
	// connectors first, then the ones with no direction, then the opposite end
	// listed but not choosable. Read from the *cable's* department rather than
	// each connector's own, so the tags in the list say the same thing as the
	// slot labels above them.
	function connectorOptions(slot: CableEndRole) {
		const ranked = connectors.map((c) => {
			const role = connectorRole(c, connectors, inputGender);
			return {
				...c,
				hint: role ? CABLE_END_LABEL[role] : null,
				disabled: !!role && role !== slot,
				rank: role === slot ? 0 : role ? 2 : 1
			};
		});
		return ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'de'));
	}

	let connectorsIn = $derived(connectorOptions('in'));
	let connectorsOut = $derived(connectorOptions('out'));

	// Which side the create modal was opened from, so its result lands in the
	// right field. null means it is closed.
	let creatingFor = $state<'connectorA' | 'connectorB' | null>(null);
	let creatingName = $state('');
	let connectorModalOpen = $state(false);

	function openConnectorModal(side: 'connectorA' | 'connectorB', name: string) {
		creatingFor = side;
		creatingName = name;
		connectorModalOpen = true;
	}

	function toggleCable(on: boolean) {
		value.cable = on ? { cableType: '', connectorA: '', connectorB: '', lengthM: '' } : null;
	}

	// Picking a type fills in what this pool's newest cable of that type has —
	// only into fields nobody has typed in, so a correction is never undone.
	// Also the clear path: emptying the field hands this an empty name, which has
	// to reach `cableType` — a handler that ignored null left the old value in
	// the draft and wrote it straight back on save.
	function pickType(name: string) {
		const cable = value.cable;
		if (!cable) return;
		cable.cableType = name;
		const precedent = name ? vocab?.byType[name] : null;
		if (!precedent) return;
		if (!cable.connectorA.trim() && precedent.connectorA) cable.connectorA = precedent.connectorA;
		if (!cable.connectorB.trim() && precedent.connectorB) cable.connectorB = precedent.connectorB;
		if (!value.categoryId && precedent.categoryId) value.categoryId = precedent.categoryId;
	}

	// Picking a connector also answers which department the cable belongs to —
	// a Schuko plug is Power wherever it turns up. Only into an empty field, so
	// it never overrides a choice, and the cable type's own precedent (applied by
	// `pickType`) still wins because that runs first in the normal order of use.
	// The two ends are an ordered pair — "CEE32 → CEE16" and "CEE16 → CEE32" are
	// different adapters — so it is worth saying when they look recorded the
	// wrong way round. Silent below: same gender both ends, an end nobody has
	// catalogued, or a department with no direction all answer false.
	let inputGender = $derived(
		categories.find((c) => c.id === value.categoryId)?.cableInputGender ?? null
	);
	let reversed = $derived(
		!!value.cable &&
			endsAreReversed(
				{ connectorA: value.cable.connectorA, connectorB: value.cable.connectorB },
				connectors,
				inputGender
			)
	);

	function swapEnds() {
		if (!value.cable) return;
		const { connectorA, connectorB } = value.cable;
		value.cable.connectorA = connectorB;
		value.cable.connectorB = connectorA;
	}

	function setConnector(
		side: 'connectorA' | 'connectorB',
		name: string,
		/** From a row just saved, whose catalogue refresh may not have landed yet. */
		categoryId?: string | null
	) {
		if (!value.cable) return;
		value.cable[side] = name;

		// One end almost always implies the other: pick Schuko M and the far end
		// is Schuko F. Only into an empty field, and only where the family leaves
		// no doubt — see counterpartConnector.
		const far = side === 'connectorA' ? 'connectorB' : 'connectorA';
		if (name && !value.cable[far].trim()) {
			const mate = counterpartConnector(name, connectors);
			if (mate) value.cable[far] = mate.name;
		}

		if (value.categoryId) return;
		const department =
			categoryId ??
			connectors.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())?.categoryId;
		if (department) value.categoryId = department;
	}

	// The name is prefilled from type + length and then belongs to whoever typed
	// in it. `lastDerived` is how the two are told apart: as long as the field
	// still holds exactly what we last derived, a length change carries it along;
	// the moment someone writes "Schuko → TRUE1 1,5 m" it is theirs and stays put.
	let lastDerived = $state(derivedName(value.cable, []));
	// The parent may swap the whole draft (the product wizard steps between
	// products), which has to re-seed the comparison rather than treat the
	// incoming name as one we derived.
	let seededFor = $state<ProductDraft | null>(value);

	$effect(() => {
		const derived = derivedName(value.cable, connectors);
		if (seededFor !== value) {
			seededFor = value;
			lastDerived = derived;
			// A name that already *is* the derived one keeps following along;
			// anything else was written by a person and is left alone.
			if (value.name !== derived) return;
		}
		if (derived && (value.name === '' || value.name === lastDerived)) value.name = derived;
		lastDerived = derived;
	});
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<Label for="{idPrefix}-name">Product Name</Label>
		<Input id="{idPrefix}-name" bind:value={value.name} required disabled={identityDisabled} />
	</div>

	<!-- Cables are the one product class the name alone can't answer questions
	     about ("everything with a TRUE1 end", "all XLR ≥ 5 m"), so they get four
	     columns of their own. The name stays the label everywhere. -->
	<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
		<input
			type="checkbox"
			checked={!!value.cable}
			disabled={identityDisabled}
			onchange={(e) => toggleCable((e.currentTarget as HTMLInputElement).checked)}
			class="h-4 w-4 rounded border-input"
		/>
		This is a cable
	</label>

	{#if value.cable}
		<div class="grid gap-4 rounded-md border border-dashed p-3 sm:grid-cols-2">
			<div class="space-y-2">
				<!-- Once the department states which end feeds, the slots can say so
				     themselves — better than catching it afterwards with the warning
				     below. Blank for a department with no direction (Netzwerk, USB). -->
				<Label>
					Connector A
					{#if inputGender}
						<span class="ml-1 font-mono text-xs font-normal text-muted-foreground"
							>{CABLE_END_LABEL.in}</span
						>
					{/if}
				</Label>
				<CreatableSelect
					items={connectorsIn}
					value={value.cable.connectorA
						? { id: value.cable.connectorA, name: value.cable.connectorA }
						: null}
					onchange={(sel) => setConnector('connectorA', sel?.name ?? '')}
					oncreate={(name) => openConnectorModal('connectorA', name)}
					disabled={identityDisabled}
					showImages
					placeholder="XLR3 M…"
				/>
			</div>

			<div class="space-y-2">
				<Label>
					Connector B
					{#if inputGender}
						<span class="ml-1 font-mono text-xs font-normal text-muted-foreground"
							>{CABLE_END_LABEL.out}</span
						>
					{/if}
				</Label>
				<CreatableSelect
					items={connectorsOut}
					value={value.cable.connectorB
						? { id: value.cable.connectorB, name: value.cable.connectorB }
						: null}
					onchange={(sel) => setConnector('connectorB', sel?.name ?? '')}
					oncreate={(name) => openConnectorModal('connectorB', name)}
					disabled={identityDisabled}
					showImages
					placeholder="XLR3 F…"
				/>
			</div>

			{#if reversed}
				<div
					class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs sm:col-span-2"
				>
					<p>
						These look the wrong way round. Connector A should be the end power or signal comes in
						on — the end that goes into the supply.
					</p>
					<button
						type="button"
						onclick={swapEnds}
						disabled={identityDisabled}
						class="mt-1 font-medium underline underline-offset-2 disabled:no-underline disabled:opacity-50"
					>
						Swap the ends
					</button>
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="{idPrefix}-length">Length (m)</Label>
				<!-- Text, not number: Safari's number input rejects the comma German
				     speakers type a decimal with. -->
				<Input
					id="{idPrefix}-length"
					inputmode="decimal"
					placeholder="10"
					bind:value={value.cable.lengthM}
					disabled={identityDisabled}
				/>
			</div>

			<div class="space-y-2 sm:col-span-2">
				<Label>Additional info</Label>
				<CreatableSelect
					items={typeItems}
					value={value.cable.cableType
						? { id: value.cable.cableType, name: value.cable.cableType }
						: null}
					onchange={(sel) => pickType(sel?.name ?? '')}
					oncreate={(name) => pickType(name)}
					disabled={identityDisabled}
					placeholder="Additional info, e.g. CAT7 or 2.5mm²"
				/>
				<p class="text-xs text-muted-foreground">
					Optional, and only for what the connectors cannot say — the wire itself. Two RJ45 ends are
					a patch lead whether they are CAT6A or CAT7.
				</p>
			</div>
		</div>
	{/if}

	<div class="space-y-2">
		<Label for="{idPrefix}-category">Category</Label>
		<CategorySelect
			id="{idPrefix}-category"
			{categories}
			bind:value={value.categoryId}
			placeholder="Select a category"
			disabled={identityDisabled}
		/>
	</div>

	{#if showPrice}
		<div class="space-y-2">
			<Label for="{idPrefix}-price">Net purchase price (€)</Label>
			<Input
				id="{idPrefix}-price"
				type="number"
				min="0"
				step="0.01"
				placeholder="Unknown"
				bind:value={value.netPurchasePrice}
			/>
			<p class="text-sm text-muted-foreground">
				What your organization's rental rate is calculated from. It applies to every unit of this
				product your organization bills — other organizations set their own price.
			</p>
		</div>
	{/if}

	<div class="space-y-2">
		<Label>Product Image</Label>
		<ImageUpload bind:value={value.imagePath} label="Product photo" />
	</div>
</div>

<!-- Outside the cable block on purpose: closing the modal must not depend on
     the block that opened it still being rendered. -->
<ConnectorFormModal
	bind:open={connectorModalOpen}
	initialName={creatingName}
	idPrefix="{idPrefix}-connector"
	onSaved={(saved) => {
		if (creatingFor) setConnector(creatingFor, saved.name, saved.categoryId);
		creatingFor = null;
	}}
/>
