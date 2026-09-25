<script module lang="ts">
	/** What the editor's own action buttons would show — for a page that puts them elsewhere. */
	export type ProductEditorActions = {
		canEdit: boolean;
		canDuplicate: boolean;
		/** Why Delete is refused, or null when it isn't. */
		deleteBlockedReason: string | null;
	};
</script>

<script lang="ts">
	// Everything about one catalog product that can be changed, as one card with
	// one Save: name, manufacturer, category, cable or license, picture, the
	// connectors built into it, and each managed org's price. Merging a duplicate
	// away and deleting an unused entry live here too.
	//
	// Shared by the /products wizard, which steps through the catalog with it,
	// and by a product's own page. The wizard supplies its own footer — stepping
	// saves — and reads `dirty` to decide whether a step has to save first.
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { categoryLabel } from '$lib/category';
	import { canWrite } from '$lib/roles';
	import { getErrorMessage, orgLabel, plural } from '$lib/utils';
	import {
		deleteProduct,
		duplicateProduct,
		getCategories,
		getManufacturers,
		getProductCatalog,
		getProducts,
		mergeProducts,
		setOrgProductPrice,
		setProductPorts,
		updateProduct
	} from '$lib/remote/assets.remote';
	import type { getMyOrgs } from '$lib/remote/orgs.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { isCable, sameWays } from '$lib/cable';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { Modal } from '$lib/components/ui/modal';
	import ProductActions from './product-actions.svelte';
	import { productLabel } from '$lib/product-label';
	import {
		manufacturerIdOf,
		manufacturerSelection,
		withNoManufacturer
	} from '$lib/no-manufacturer.svelte';
	import {
		ProductFields,
		cableDraftFrom,
		cableInputFrom,
		type ProductDraft
	} from '$lib/components/ui/product-fields';
	import {
		ProductPorts,
		portDraftsFrom,
		portInputsFrom,
		portsUnchanged,
		type PortDraft
	} from '$lib/components/ui/product-ports';

	type CatalogProduct = Awaited<ReturnType<typeof getProductCatalog>>[number];

	type Props = {
		product: CatalogProduct;
		// The lists the form picks from are read by the page, not in here: a
		// query read through `.current` inside a component that mounts and
		// unmounts with its data — as this one does in the wizard — ends up
		// reading an instance whose owner is gone, and stays empty.
		orgs: Awaited<ReturnType<typeof getMyOrgs>>;
		categories: Awaited<ReturnType<typeof getCategories>>;
		manufacturers: Awaited<ReturnType<typeof getManufacturers>>;
		/** Every product, for the merge picker — a duplicate with no units is the easiest kind. */
		allProducts: Awaited<ReturnType<typeof getProducts>>;
		/** Units this user can see, per product id — what the merge dialog says will move. */
		unitCounts: ReadonlyMap<string, number>;
		isAdmin: boolean;
		userId: string | undefined;
		/**
		 * Whose price fields to show. Empty shows one per org the user manages; an
		 * org id narrows it to that org — the wizard's org filter, under which the
		 * catalog only carries that org's price rows, so a field for any other
		 * would read as "no price" and delete a stored one on save.
		 */
		priceOrgId?: string;
		/** Whether the form holds unsaved changes. Read-only for the parent. */
		dirty?: boolean;
		saving?: boolean;
		/** Whether one of the editor's dialogs is open — so arrow keys can leave it alone. */
		modalOpen?: boolean;
		/** Beside the actions in the header — the wizard's position counter. */
		headerExtra?: Snippet;
		/** The footer's contents. Without them, the footer is a Save button. */
		footerActions?: Snippet;
		/**
		 * Whether Duplicate, Merge and Delete sit in the card's header. A page
		 * that shows them itself turns this off, reads `actions` and calls
		 * `openDuplicate` / `openMerge` / `openDelete`.
		 */
		showActions?: boolean;
		actions?: ProductEditorActions;
		/** Link to the product's own page — pointless on that page itself. */
		showProductLink?: boolean;
		idPrefix?: string;
		onSaved?: () => void | Promise<void>;
		/** After a merge, with whichever product survived it. */
		onMerged?: (survivorId: string) => void;
		/** Right before a delete runs, while the product is still in every list. */
		onBeforeDelete?: () => void;
		onDeleted?: () => void;
	};

	let {
		product,
		orgs,
		categories,
		manufacturers,
		allProducts,
		unitCounts,
		isAdmin,
		userId,
		priceOrgId = '',
		dirty = $bindable(false),
		saving = $bindable(false),
		modalOpen = $bindable(false),
		headerExtra,
		footerActions,
		showActions = true,
		actions = $bindable(),
		showProductLink = false,
		idPrefix = 'product-editor',
		onSaved,
		onMerged,
		onBeforeDelete,
		onDeleted
	}: Props = $props();

	// Products are global, but editing one is an org-admin right. A member who
	// hasn't got it anywhere would only find that out when a save failed.
	let canEdit = $derived(isAdmin || orgs.some((o) => o.role === 'ADMIN' || o.role === 'OWNER'));
	let managedOrgs = $derived(
		orgs.filter((o) => isAdmin || o.role === 'ADMIN' || o.role === 'OWNER')
	);
	let managedOrgIdSet = $derived(new Set(managedOrgs.map((o) => o.id)));
	let priceOrgs = $derived(
		priceOrgId ? managedOrgs.filter((o) => o.id === priceOrgId) : managedOrgs
	);
	let canContribute = $derived(isAdmin || orgs.some(canWrite));

	// Renaming or recategorizing follows the ownership rule the server
	// enforces: every org holding units must be one this user admins. Locked
	// fields are greyed out rather than failing on save.
	let identityLocked = $derived.by(() => {
		if (!canEdit) return true;
		if (isAdmin) return false;
		// Nobody holds units, so there is no owning org to be admin of: it
		// answers to whoever added it. See `productControl` on the server.
		if (product.owningOrgIds.length === 0) return product.createdById !== userId;
		return product.owningOrgIds.some((id) => !managedOrgIdSet.has(id));
	});
	// A first picture — and a first panel — is open to everyone who works in an
	// org; replacing one follows the identity rule. See `setProductPorts`.
	let imageLocked = $derived((identityLocked && !!product.imagePath) || !canContribute);
	let portsLocked = $derived((identityLocked && product.ports.length > 0) || !canContribute);

	function storedPrice(orgId: string): number | undefined {
		const row = product.prices.find((p) => p.organizationId === orgId);
		return row == null ? undefined : Number(row.netPurchasePrice);
	}

	let draft = $state<ProductDraft>({
		name: '',
		categoryId: '',
		imagePath: '',
		netPurchasePrice: undefined,
		cable: null,
		isLicense: false
	});
	let manufacturer = $state<{ id: string | null; name: string } | null>(null);
	// A cleared field means no manufacturer, the same as picking that entry.
	let chosenManufacturerId = $derived(manufacturer ? manufacturerIdOf(manufacturer) : null);
	let portRows = $state<PortDraft[]>([]);
	// One price per org the user manages — prices are per-org, and undefined
	// means "no price set for this org".
	let priceDrafts = $state<Record<string, number | undefined>>({});
	let draftFor = $state('');
	let pricesFor = $state('');

	// The draft follows whatever product is in front — an effect rather than a
	// derived, because from there on it is the user's own state to edit. Keyed
	// on the stored version as well as the id: a merge rewrites the survivor on
	// the server (a picture, a cable taken over from the duplicate), and the
	// refreshed catalog arrives after the command returns. Keyed on the id alone,
	// the draft was seeded from the stale row, showed a change nobody made, and
	// a Save wrote the old values back over what the merge had just brought in.
	let productKey = $derived(`${product.id}@${new Date(product.updatedAt).getTime()}`);
	$effect(() => {
		if (productKey === draftFor) return;
		draftFor = productKey;
		manufacturer = manufacturerSelection(product.manufacturer);
		draft = {
			name: product.name,
			categoryId: product.categoryId,
			imagePath: product.imagePath ?? '',
			netPurchasePrice: undefined,
			cable: cableDraftFrom(product),
			isLicense: product.isLicense
		};
		portRows = portDraftsFrom(product.ports);
	});

	// Price drafts additionally follow the org filter: switching it swaps which
	// price rows the catalog even carries, so stale drafts for the previous
	// selection must not survive into a save.
	$effect(() => {
		const key = `${product.id}:${priceOrgId}:${priceOrgs.map((o) => o.id).join(',')}`;
		if (key === pricesFor) return;
		pricesFor = key;
		priceDrafts = Object.fromEntries(priceOrgs.map((org) => [org.id, storedPrice(org.id)]));
	});

	let seeded = $derived(draftFor === productKey);

	// What a cable is counts as identity here for the same reason the server
	// treats it as such: it decides which product a unit belongs to.
	let cableDraftInput = $derived(cableInputFrom(draft.cable));
	let cableDirty = $derived(
		seeded &&
			((cableDraftInput?.cableType ?? null) !== product.cableType ||
				(cableDraftInput?.connectorA ?? null) !== product.connectorA ||
				(cableDraftInput?.connectorB ?? null) !== product.connectorB ||
				(cableDraftInput?.lengthCm ?? null) !== product.lengthCm ||
				// A loom's make-up is identity as much as a lead's two ends, and it is
				// the only part of it that can change while all four columns stay put.
				!sameWays(product.ways, cableDraftInput?.ways ?? []))
	);
	let identityDirty = $derived(
		seeded &&
			(draft.name.trim() !== product.name ||
				chosenManufacturerId !== product.manufacturerId ||
				draft.categoryId !== product.categoryId ||
				draft.isLicense !== product.isLicense ||
				cableDirty)
	);
	let imageDirty = $derived(seeded && draft.imagePath.trim() !== (product.imagePath ?? ''));

	// A cable's connectors are its two ends, and a license has none — so a
	// product turned into either loses its panel on save.
	let hasPanel = $derived(!draft.cable && !draft.isLicense);
	let portsDirty = $derived(seeded && !portsUnchanged(hasPanel ? portRows : [], product.ports));

	let dirtyPriceOrgIds = $derived(
		seeded
			? priceOrgs
					.map((org) => org.id)
					.filter((orgId) => (priceDrafts[orgId] ?? null) !== (storedPrice(orgId) ?? null))
			: []
	);
	let isDirty = $derived(identityDirty || imageDirty || portsDirty || dirtyPriceOrgIds.length > 0);
	$effect(() => {
		if (dirty !== isDirty) dirty = isDirty;
	});

	/** Returns whether the save went through, so a caller can hold position on failure. */
	export async function save(): Promise<boolean> {
		if (!isDirty || saving) return true;
		if (!draft.name.trim()) {
			toast.error('Product name is required');
			return false;
		}
		if (chosenManufacturerId === undefined) {
			toast.error('Pick a manufacturer from the list, or Generic / unknown manufacturer');
			return false;
		}
		saving = true;
		try {
			if (identityDirty || imageDirty) {
				await updateProduct({
					productId: product.id,
					// Locked identity fields are greyed out in the form; not sending
					// them keeps an image-only save from tripping the server's
					// ownership check on an unchanged name.
					...(identityLocked
						? {}
						: {
								name: draft.name,
								manufacturerId: chosenManufacturerId,
								categoryId: draft.categoryId,
								cable: cableDraftInput,
								isLicense: draft.isLicense
							}),
					imagePath: draft.imagePath
				});
			}
			if (portsDirty) {
				await setProductPorts({
					productId: product.id,
					ports: hasPanel ? portInputsFrom(portRows) : []
				});
			}
			for (const orgId of dirtyPriceOrgIds) {
				await setOrgProductPrice({
					organizationId: orgId,
					productId: product.id,
					netPurchasePrice: priceDrafts[orgId] ?? null
				});
			}
			await onSaved?.();
			return true;
		} catch (err) {
			toast.error(getErrorMessage(err));
			return false;
		} finally {
			saving = false;
		}
	}

	export async function saveAndStay() {
		if (await save()) toast.success('Product updated');
	}

	// ── Merging a duplicate away ──────────────────────────────────────────────
	// Two rows for one device is the failure mode this catalogue has: nothing
	// stops a second "Robin 600" from being typed in next to "Robe Robin 600",
	// and once both hold units, every count is half right.

	type GlobalProduct = Awaited<ReturnType<typeof getProducts>>[number];

	let mergeOpen = $state(false);
	let mergePick = $state<{ id: string | null; name: string } | null>(null);
	// Which of the two names survives. Defaults to the product in front, because
	// that is the one whose fields are being curated — but only defaults: the
	// moment a duplicate turns up you know which spelling is right.
	let keepCurrent = $state(true);
	let merging = $state(false);

	let mergeOptions = $derived(
		allProducts.filter((p) => p.id !== product.id).map((p) => ({ id: p.id, name: productLabel(p) }))
	);
	let picked = $derived<GlobalProduct | null>(
		allProducts.find((p) => p.id === mergePick?.id) ?? null
	);
	let survivor = $derived(keepCurrent ? product : picked);
	let absorbed = $derived(keepCurrent ? picked : product);

	// Only the units this user can see. A product with units in an organization
	// the user isn't in is not counted here and not mergeable either — the
	// command refuses it by name rather than moving somebody else's inventory.
	let movingCount = $derived(absorbed ? (unitCounts.get(absorbed.id) ?? 0) : 0);

	// An image is not identity but work someone did, so the merge keeps it when
	// the survivor has none. Said out loud because it is the one part of the
	// operation that isn't obvious from picking a side.
	let inheritsImage = $derived(
		!!survivor && !!absorbed && !survivor.imagePath && !!absorbed.imagePath
	);
	// The same rule for what a cable is and for being a license — see
	// `mergeProducts`. Said here for the case it guards against: picking the
	// plain entry as the one to keep used to drop the cable altogether.
	let inheritsCable = $derived(!!survivor && !!absorbed && !isCable(survivor) && isCable(absorbed));
	let inheritsLicense = $derived(
		!!survivor && !!absorbed && !survivor.isLicense && absorbed.isLicense
	);
	let keepsOwnCable = $derived(!!survivor && !!absorbed && isCable(survivor) && isCable(absorbed));

	/** With a pick where the duplicate is already known — the cable warning hands one over. */
	export function openMerge(pick: { id: string; name: string } | null = null) {
		mergePick = pick;
		keepCurrent = true;
		mergeOpen = true;
	}

	async function doMerge() {
		if (!survivor || !absorbed || merging) return;
		if (isDirty && !(await save())) return;
		merging = true;
		try {
			const { movedAssets } = await mergeProducts({
				targetProductId: survivor.id,
				sourceProductId: absorbed.id
			});
			// The survivor may have just inherited an image, a panel or a price, so
			// the drafts have to be seeded again from what exists now.
			draftFor = '';
			pricesFor = '';
			mergeOpen = false;
			toast.success(plural(movedAssets, ['Merged — # unit moved', 'Merged — # units moved']));
			onMerged?.(survivor.id);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			merging = false;
		}
	}

	let deleteOpen = $state(false);
	let deleting = $state(false);

	export function openDelete() {
		deleteOpen = true;
	}

	// The header's count is scoped to the orgs in view and leaves retired units
	// out, but a unit of any status anywhere still blocks a delete — so the
	// reason names whichever of those is in the way.
	let deleteBlockedReason = $derived(
		product.hasAssets
			? product.assetCount > 0
				? 'Still has units. Delete the unused ones, or merge it into the product it duplicates.'
				: product.retiredCount > 0 && product.elsewhereCount > 0
					? 'Retired units and units in other organizations still refer to it.'
					: product.retiredCount > 0
						? 'Retired units still count. Delete the unused ones, or merge it into the product it duplicates.'
						: 'Organizations not shown here still hold units of it.'
			: identityLocked
				? 'Only whoever added it, an admin of every organization holding it, or a system admin.'
				: null
	);

	$effect(() => {
		const next = { canEdit, canDuplicate: canContribute, deleteBlockedReason };
		if (
			actions?.canEdit !== next.canEdit ||
			actions.canDuplicate !== next.canDuplicate ||
			actions.deleteBlockedReason !== next.deleteBlockedReason
		)
			actions = next;
	});

	async function doDelete() {
		if (product.hasAssets || deleting) return;
		const deletedId = product.id;
		onBeforeDelete?.();
		deleting = true;
		try {
			await deleteProduct(deletedId);
			draftFor = '';
			pricesFor = '';
			deleteOpen = false;
			toast.success('Product deleted');
			onDeleted?.();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			deleting = false;
		}
	}

	// ── Duplicating ───────────────────────────────────────────────────────────
	// The next length of a lead, the variant of a fixture: a new row that starts
	// with everything this one already says, and a name that says what differs.

	let duplicateOpen = $state(false);
	let duplicateName = $state('');
	let duplicating = $state(false);

	export function openDuplicate() {
		duplicateName = product.name;
		duplicateOpen = true;
	}

	async function doDuplicate() {
		if (!duplicateName.trim() || duplicating) return;
		// The copy is made from what is stored, so edits in the form go first.
		if (isDirty && !(await save())) return;
		duplicating = true;
		try {
			const { id } = await duplicateProduct({ productId: product.id, name: duplicateName });
			duplicateOpen = false;
			toast.success('Product duplicated');
			await goto(resolve(`/products/${id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			duplicating = false;
		}
	}

	$effect(() => {
		const open = mergeOpen || deleteOpen || duplicateOpen;
		if (modalOpen !== open) modalOpen = open;
	});
</script>

<!-- The card clips to its rounded corners, cutting off any picker that opens
     past its edge. Nothing in this one is full-bleed. -->
<Card.Root class="overflow-visible">
	<Card.Header>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<Card.Title class="flex items-center gap-2">
					{productLabel(product)}
					{#if isDirty}
						<span class="h-2 w-2 shrink-0 rounded-full bg-yellow-500" title="Unsaved changes"
						></span>
					{/if}
				</Card.Title>
				<Card.Description class="flex flex-wrap items-center gap-2 pt-1">
					<CategoryPill name={categoryLabel(product.category)} color={product.category.color} />
					<span>{product.assetCount} units</span>
					{#if product.retiredCount > 0}
						<span>· {plural(product.retiredCount, ['# retired', '# retired'])}</span>
					{/if}
					{#if product.elsewhereCount > 0}
						<span
							>· {plural(product.elsewhereCount, [
								'# in other organizations',
								'# in other organizations'
							])}</span
						>
					{/if}
					{#if showProductLink}
						<a
							href={resolve(`/products/${product.id}`)}
							class="underline-offset-2 hover:text-foreground hover:underline"
							>Open product page →</a
						>
					{/if}
					<a
						href="{resolve('/assets')}?q={encodeURIComponent(product.name)}"
						class="underline-offset-2 hover:text-foreground hover:underline">View in Devices →</a
					>
				</Card.Description>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				{#if showActions && actions}
					<ProductActions
						{actions}
						size="sm"
						onDuplicate={openDuplicate}
						onMerge={() => openMerge()}
						onDelete={openDelete}
					/>
				{/if}
				{@render headerExtra?.()}
			</div>
		</div>
	</Card.Header>
	<Card.Content>
		{#if identityLocked && canEdit}
			<div class="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
				{#if product.hasAssets}
					Units of this product belong to organizations you don't administer, so its name,
					manufacturer and category are locked here.
				{:else}
					No organization holds units of this product, so only whoever added it or a system admin
					can change its name, manufacturer and category.
				{/if}
				{#if product.imagePath}
					Your own organization's price still saves.
				{:else}
					A first picture and your own organization's price still save.
				{/if}
			</div>
		{/if}
		<div class="mb-4 space-y-2">
			<p class="text-sm font-medium">Manufacturer</p>
			<CreatableSelect
				items={withNoManufacturer(manufacturers)}
				bind:value={manufacturer}
				allowCreate={false}
				disabled={identityLocked}
				placeholder="Search manufacturers…"
			/>
		</div>
		<ProductFields
			{categories}
			bind:value={draft}
			{idPrefix}
			showPrice={false}
			identityDisabled={identityLocked}
			imageDisabled={imageLocked}
			productId={product.id}
			onMergeTwin={canEdit ? openMerge : undefined}
		/>
		{#if hasPanel}
			<div class="mt-4 space-y-2">
				<p class="text-sm font-medium">Connectors</p>
				<p class="text-sm text-muted-foreground">
					What this device's panel has — the same for every unit of this product.
				</p>
				<ProductPorts
					bind:rows={portRows}
					productCategoryId={draft.categoryId}
					{categories}
					disabled={portsLocked}
					idPrefix="{idPrefix}-ports"
				/>
			</div>
		{/if}
		{#if priceOrgs.length > 0}
			<div class="mt-4 space-y-2">
				<p class="text-sm font-medium">Net purchase price (€)</p>
				<p class="text-sm text-muted-foreground">
					Per organization — what that organization's rental rate is calculated from. Other
					organizations set their own price.
				</p>
				{#each priceOrgs as org (org.id)}
					<div class="flex items-center gap-3">
						<span class="w-40 truncate text-sm">{orgLabel(org)}</span>
						<input
							type="number"
							min="0"
							step="0.01"
							placeholder="Unknown"
							bind:value={priceDrafts[org.id]}
							class="h-10 w-40 rounded-md border border-input bg-background px-3 py-2 text-right text-sm focus:ring-2 focus:ring-ring focus:outline-none"
						/>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
	<Card.Footer class="flex flex-wrap items-center justify-between gap-3">
		{#if footerActions}
			{@render footerActions()}
		{:else}
			<span></span>
			<Button icon="save" onclick={saveAndStay} disabled={!isDirty || saving}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		{/if}
	</Card.Footer>
</Card.Root>

<Modal bind:open={mergeOpen} title="Merge duplicate product" size="lg" dismissible={!merging}>
	{#snippet description()}
		Two entries for one device split its units in half, and every count built on them is half right.
		Pick the other entry, then say which of the two names is the one to keep.
	{/snippet}

	{#snippet children()}
		<div class="space-y-5">
			<CreatableSelect
				items={mergeOptions}
				bind:value={mergePick}
				allowCreate={false}
				disabled={merging}
				placeholder="Search the whole catalog for the duplicate…"
			/>

			{#if survivor && absorbed}
				<fieldset class="space-y-2">
					<legend class="pb-2 text-sm font-medium">Which name is right?</legend>
					{#each [{ choice: product, keep: true }, { choice: picked, keep: false }] as option (option.keep)}
						{#if option.choice}
							<label
								class="flex items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted/40"
							>
								<input
									type="radio"
									name="{idPrefix}-mergeSurvivor"
									checked={keepCurrent === option.keep}
									onchange={() => (keepCurrent = option.keep)}
									disabled={merging}
									class="mt-0.5 h-4 w-4"
								/>
								<span class="min-w-0 flex-1">
									<span class="block font-medium">{productLabel(option.choice)}</span>
									<span class="block text-xs text-muted-foreground">
										{categoryLabel(option.choice.category)} ·
										{plural(unitCounts.get(option.choice.id) ?? 0, ['# unit here', '# units here'])}
									</span>
								</span>
							</label>
						{/if}
					{/each}
				</fieldset>

				<div class="space-y-1.5 rounded-md bg-muted/50 p-3 text-sm">
					<p>
						<span class="font-medium">{productLabel(absorbed)}</span> is deleted.
						{plural(movingCount, ['Its # unit becomes', 'Its # units become'])}
						<span class="font-medium">{productLabel(survivor)}</span> — same tags, same history, same
						accessories.
					</p>
					{#if inheritsImage}
						<p class="text-muted-foreground">The image comes along — this entry has none.</p>
					{/if}
					{#if inheritsCable}
						<p class="text-muted-foreground">
							The cable details come along — type, ends, length and ways — since this entry has
							none.
						</p>
					{:else if keepsOwnCable}
						<p class="text-muted-foreground">
							Both are cables: the surviving entry keeps its own type, ends, length and ways.
						</p>
					{/if}
					{#if inheritsLicense}
						<p class="text-muted-foreground">
							It stays a software license, so the units' credentials remain available.
						</p>
					{/if}
					<p class="text-muted-foreground">
						Purchase prices are each organization's own and move over with the merge — an
						organization that priced both entries keeps the surviving entry's price.
					</p>
					{#if survivor.manufacturerId !== absorbed.manufacturerId}
						<p class="text-muted-foreground">
							{#if survivor.manufacturer}
								Different manufacturers: the units end up under
								<span class="font-medium">{survivor.manufacturer.name}</span>.
							{:else}
								Different manufacturers: the units end up under Generic / unknown manufacturer.
							{/if}
						</p>
					{/if}
					<p class="text-muted-foreground">
						Offers and invoices already written are not touched — they say what they said.
					</p>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<Button icon="merge" onclick={doMerge} disabled={!picked || merging}>
			{merging ? 'Merging…' : 'Merge'}
		</Button>
		<Button icon="close" variant="outline" onclick={() => (mergeOpen = false)} disabled={merging}>
			Cancel
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={deleteOpen} title="Delete unused product" dismissible={!deleting}>
	{#snippet description()}
		This permanently removes the catalogue entry. Products with any units, including retired units,
		cannot be deleted.
	{/snippet}

	<!-- An explicit children snippet: plain content after the description
	     snippet is dropped from extraction. See CLAUDE.md, wuchale. -->
	{#snippet children()}
		<p class="text-sm">
			Delete <span class="font-medium">{productLabel(product)}</span>?
		</p>
	{/snippet}

	{#snippet footer()}
		<Button
			icon="delete"
			variant="destructive"
			onclick={doDelete}
			disabled={product.hasAssets || deleting}
		>
			{deleting ? 'Deleting…' : 'Delete product'}
		</Button>
		<Button icon="close" variant="outline" onclick={() => (deleteOpen = false)} disabled={deleting}
			>Cancel</Button
		>
	{/snippet}
</Modal>

<Modal bind:open={duplicateOpen} title="Duplicate product" dismissible={!duplicating}>
	<!-- Body first, snippets after: see CLAUDE.md, wuchale. -->
	{#snippet children()}
		<form
			class="space-y-2"
			onsubmit={(e) => {
				e.preventDefault();
				doDuplicate();
			}}
		>
			<label for="{idPrefix}-duplicateName" class="text-sm font-medium">Name of the copy</label>
			<input
				id="{idPrefix}-duplicateName"
				bind:value={duplicateName}
				disabled={duplicating}
				class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
			/>
			<p class="text-sm text-muted-foreground">
				Manufacturer, category, picture, connectors and cable details are copied. Prices and units
				are not. Everything else can be changed on the new product's page.
			</p>
		</form>
	{/snippet}

	{#snippet description()}
		A new catalogue entry that starts as a copy of
		<span class="font-medium">{productLabel(product)}</span>.
	{/snippet}

	{#snippet footer()}
		<Button icon="copy" onclick={doDuplicate} disabled={!duplicateName.trim() || duplicating}>
			{duplicating ? 'Duplicating…' : 'Duplicate'}
		</Button>
		<Button
			icon="close"
			variant="outline"
			onclick={() => (duplicateOpen = false)}
			disabled={duplicating}>Cancel</Button
		>
	{/snippet}
</Modal>
