<script lang="ts">
	import { customerLabel, getErrorMessage, orgLabel, plural } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { AddressInput } from '$lib/components/ui/address-input';
	import { CustomerSelect } from '$lib/components/ui/customer-select';
	import {
		getProduction,
		getProductionAudience,
		removeBundleFromProduction,
		syncBundleInProduction,
		syncAssetAccessoriesInProduction,
		addCrewMember,
		removeCrewMember,
		removeProductionItem,
		deleteProduction,
		cancelProduction,
		reopenProduction,
		updateProductionAddress,
		updateProductionDuration,
		updateProductionCustomer
	} from '$lib/remote/productions.remote';
	import { getBundles } from '$lib/remote/assets.remote';
	import { getMyOrgs, getOrgUsers } from '$lib/remote/orgs.remote';
	import { getOffersForProduction, getInvoicesForProduction } from '$lib/remote/offers.remote';
	import { supersededOfferIds } from '$lib/offer-versions';
	import { ROLE_FOR, roleAtLeast, type OrgRole } from '$lib/roles';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import type { Prisma } from '$lib/prisma/client';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import BulkActionsBar from '$lib/components/ui/bulk-actions-bar.svelte';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { Modal } from '$lib/components/ui/modal';
	import { DropdownMenu } from 'bits-ui';
	import { LicenseRevealModal } from '$lib/components/ui/license-credentials';
	import CopyEquipmentModal from './copy-equipment-modal.svelte';
	import { accessorySummary, nestAccessories, type Nested } from '$lib/production-items';

	let { productionId }: { productionId: string } = $props();
	let production = $derived(await getProduction(productionId));

	let working = $state(false);
	let deleteOpen = $state(false);
	let deleting = $state(false);
	async function handleDeleteProduction() {
		deleting = true;
		try {
			await deleteProduction(productionId);
			toast.success('Production deleted');
			goto(resolve('/productions'));
		} catch (err) {
			toast.error(getErrorMessage(err));
			deleting = false;
		}
	}

	// A cancelled production takes nothing new; see `requireOpenProduction`.
	// What it still holds can be taken off it, so Remove stays on `canEdit`.
	let cancelled = $derived(!!production.cancelledAt);

	let cancelOpen = $state(false);
	let cancelReason = $state('');
	let cancelling = $state(false);
	// What the dialog says it is about to do: bookings and open requests are
	// released, units that are physically out stay out.
	let releasableCount = $derived(
		production.items.filter((i) => i.status === 'PENDING' || i.status === 'APPROVED').length
	);
	let checkedOutCount = $derived(production.items.filter((i) => i.status === 'CHECKED_OUT').length);
	async function handleCancelProduction() {
		if (!cancelReason.trim()) return;
		cancelling = true;
		try {
			await cancelProduction({ productionId, reason: cancelReason });
			toast.success('Production cancelled');
			cancelOpen = false;
			cancelReason = '';
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			cancelling = false;
		}
	}

	let reopenOpen = $state(false);
	let reopening = $state(false);
	async function handleReopenProduction() {
		reopening = true;
		try {
			const result = await reopenProduction(productionId);
			reopenOpen = false;
			if (result.dropped.length > 0) {
				toast.warning(
					plural(result.dropped.length, [
						'Production reopened — # unit was booked elsewhere in the meantime and has been removed',
						'Production reopened — # units were booked elsewhere in the meantime and have been removed'
					]),
					{ description: result.dropped.join(', ') }
				);
			} else {
				toast.success('Production reopened');
			}
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			reopening = false;
		}
	}

	let allBundles = $derived(await getBundles());
	// The user's rung in the org that runs this production, asked the way the
	// server asks it (`requireOrgRole`): a system admin clears every rung. The
	// page only offers what that rung may do — a VIEWER reads, and every button
	// would otherwise end in a refusal.
	let role = $derived<OrgRole | null>(
		page.data.isAdmin
			? 'OWNER'
			: ((await getMyOrgs()).find((org) => org.id === production.organizationId)?.role ?? null)
	);
	let canEdit = $derived(!!role && roleAtLeast(role, ROLE_FOR.write));
	let canPlan = $derived(canEdit && !cancelled);
	// Deleting it, and its offers and invoices — which are read by the org's
	// billing admins only (see `billingOrgIds` in offers.remote.ts), so nobody
	// else is shown the section or has the queries run on their behalf.
	let canManage = $derived(!!role && roleAtLeast(role, ROLE_FOR.inventory));
	let offers = $derived(canManage ? await getOffersForProduction(productionId) : []);
	// Who else may open it, for the org that runs it — a lender is not told who
	// else is looking. Not awaited: the page is whole without it.
	let audienceQuery = $derived(
		role && roleAtLeast(role, ROLE_FOR.read) ? getProductionAudience(productionId) : null
	);
	let audience = $derived(audienceQuery?.current);
	let supersededOffers = $derived(supersededOfferIds(offers));
	// Once there is an offer, the next step is on it — a revision, an update from
	// the production, a copy for another customer, the invoice — so the header
	// leads there. A second, unrelated offer is rare and moves to the menu.
	// Newest first (see `getOffersForProduction`), so this is the latest current one.
	let currentOffer = $derived(offers.find((offer) => !supersededOffers.has(offer.id)));
	let invoices = $derived(canManage ? await getInvoicesForProduction(productionId) : []);

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function offerTotal(offer: (typeof offers)[number]): number {
		return offer.items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
	}

	function invoiceTotal(invoice: (typeof invoices)[number]): number {
		return invoice.items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
	}

	async function handleRemoveItem(itemId: string) {
		try {
			await removeProductionItem(itemId);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function handleRemoveBundle(bundleId: string) {
		try {
			await removeBundleFromProduction({ productionId, bundleId });
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function handleSyncBundle(bundleId: string) {
		working = true;
		try {
			const result = await syncBundleInProduction({ productionId, bundleId });
			const parts: string[] = [];
			if (result.added > 0)
				parts.push(`${result.added} asset${result.added !== 1 ? 's' : ''} added`);
			if (result.removed > 0)
				parts.push(`${result.removed} asset${result.removed !== 1 ? 's' : ''} removed`);
			if (result.adopted > 0)
				parts.push(
					plural(result.adopted, [
						'# already-booked asset moved into the bundle',
						'# already-booked assets moved into the bundle'
					])
				);
			if (result.skippedConflicts > 0) parts.push(`${result.skippedConflicts} skipped (conflict)`);
			toast.success(
				parts.length ? `Bundle updated: ${parts.join(', ')}` : 'Bundle already in sync'
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	async function handleSyncAccessories(assetId: string) {
		working = true;
		try {
			const result = await syncAssetAccessoriesInProduction({ productionId, assetId });
			toast.success(
				plural(result.added, ['# accessory added', '# accessories added']) +
					' · ' +
					plural(result.removed, ['# accessory removed', '# accessories removed'])
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	function accessoriesChanged(item: Nested<ItemPayload>) {
		const current = new Set(item.asset.accessories.map((accessory) => accessory.id));
		const booked = new Set(item.accessories.map((accessory) => accessory.assetId));
		return current.size !== booked.size || [...current].some((assetId) => !booked.has(assetId));
	}

	let bundleDivergence = $derived.by(() => {
		const map = new SvelteMap<string, { addedCount: number; removedCount: number }>();
		for (const section of displaySections) {
			if (section.kind !== 'bundle') continue;
			const currentBundle = allBundles.find((b) => b.id === section.bundleId);
			if (!currentBundle) continue;
			// Flattened: an accessory is a member of the bundle like any other unit
			// and has an item of its own — it is only *displayed* under its parent,
			// and comparing the nested view against the flat one would report every
			// kit that contains an accessory as diverged.
			const sectionItems = section.items.flatMap((i) => [i, ...i.accessories]);
			const bundleAssetIds = new Set(currentBundle.assets.map((a) => a.id));
			const productionAssetIds = new Set(sectionItems.map((i) => i.assetId));
			const addedCount = currentBundle.assets.filter((a) => !productionAssetIds.has(a.id)).length;
			const removedCount = sectionItems.filter((i) => !bundleAssetIds.has(i.assetId)).length;
			if (addedCount > 0 || removedCount > 0) {
				map.set(section.bundleId, { addedCount, removedCount });
			}
		}
		return map;
	});

	type ItemPayload = Prisma.ProductionItemGetPayload<{
		include: {
			asset: {
				include: {
					product: { include: { manufacturer: true } };
					organization: { select: { name: true; shortName: true } };
					accessories: { select: { id: true } };
				};
			};
			sourceBundle: { select: { id: true; template: { select: { name: true } } } };
		};
	}>;

	type BundleSection = {
		kind: 'bundle';
		bundleId: string;
		bundleName: string;
		total: number;
		pending: number;
		approved: number;
		checkedOut: number;
		returned: number;
		items: Nested<ItemPayload>[];
	};

	type ProductSection = {
		kind: 'product';
		productId: string;
		productName: string;
		imagePath: string | null;
		manufacturerName: string | null;
		total: number;
		pending: number;
		approved: number;
		checkedOut: number;
		returned: number;
		items: Nested<ItemPayload>[];
	};

	type DisplaySection = BundleSection | ProductSection;

	let displaySections = $derived.by((): DisplaySection[] => {
		const bundleMap = new SvelteMap<string, BundleSection>();
		const productMap = new SvelteMap<string, ProductSection>();
		// Accessories are rolled into the item they travel with, so the counts
		// below say how many *units* are booked rather than how many rows exist.
		for (const item of nestAccessories(production.items)) {
			if (item.sourceBundle) {
				const bid = item.sourceBundle.id;
				if (!bundleMap.has(bid)) {
					bundleMap.set(bid, {
						kind: 'bundle',
						bundleId: bid,
						bundleName: item.sourceBundle.template.name,
						total: 0,
						pending: 0,
						approved: 0,
						checkedOut: 0,
						returned: 0,
						items: []
					});
				}
				const g = bundleMap.get(bid)!;
				g.total++;
				g.items.push(item);
				if (item.status === 'PENDING') g.pending++;
				else if (item.status === 'APPROVED') g.approved++;
				else if (item.status === 'CHECKED_OUT') g.checkedOut++;
				else if (item.status === 'RETURNED') g.returned++;
			} else {
				const pid = item.asset.product.id;
				if (!productMap.has(pid)) {
					productMap.set(pid, {
						kind: 'product',
						productId: pid,
						productName: item.asset.product.name,
						imagePath: item.asset.product.imagePath,
						manufacturerName: item.asset.product.manufacturer?.name ?? null,
						total: 0,
						pending: 0,
						approved: 0,
						checkedOut: 0,
						returned: 0,
						items: []
					});
				}
				const g = productMap.get(pid)!;
				g.total++;
				g.items.push(item);
				if (item.status === 'PENDING') g.pending++;
				else if (item.status === 'APPROVED') g.approved++;
				else if (item.status === 'CHECKED_OUT') g.checkedOut++;
				else if (item.status === 'RETURNED') g.returned++;
			}
		}
		return [...bundleMap.values(), ...productMap.values()];
	});

	// Units, not rows: an accessory travels with its unit and is counted with it.
	let unitCount = $derived(displaySections.reduce((sum, s) => sum + s.total, 0));

	function openPrint(route: 'packing-list' | 'delivery-note' | 'crew-passes') {
		window.open(resolve(`/productions/${productionId}/${route}`), '_blank');
	}

	let expanded = new SvelteMap<string, boolean>();
	let selectedItemAssetIds = new SvelteSet<string>();

	// Only the units that have a row of their own: an accessory is selected by
	// selecting its parent, and the bulk action expands the set server-side.
	let allItemAssetIds = $derived(displaySections.flatMap((s) => s.items.map((i) => i.asset.id)));
	let allItemsSelected = $derived(
		allItemAssetIds.length > 0 && allItemAssetIds.every((id) => selectedItemAssetIds.has(id))
	);
	let someItemsSelected = $derived(allItemAssetIds.some((id) => selectedItemAssetIds.has(id)));

	function toggleSelectAllItems() {
		if (allItemsSelected) {
			allItemAssetIds.forEach((id) => selectedItemAssetIds.delete(id));
		} else {
			allItemAssetIds.forEach((id) => selectedItemAssetIds.add(id));
		}
	}

	function indeterminate(node: HTMLInputElement, value: boolean) {
		node.indeterminate = value;
		return {
			update(v: boolean) {
				node.indeterminate = v;
			}
		};
	}

	function toggleSection(id: string) {
		expanded.set(id, !expanded.get(id));
	}

	let showCrewForm = $state(false);
	let crewUserId = $state('');
	let crewRole = $state('');
	let savingCrew = $state(false);
	let orgUsers = $derived(await getOrgUsers());

	async function handleAddCrew(e: Event) {
		e.preventDefault();
		if (!crewUserId) return;
		savingCrew = true;
		try {
			await addCrewMember({
				productionId,
				userId: crewUserId,
				role: crewRole.trim() || undefined
			});
			crewUserId = '';
			crewRole = '';
			showCrewForm = false;
			toast.success('Crew member added');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingCrew = false;
		}
	}

	async function handleRemoveCrew(id: string) {
		try {
			await removeCrewMember(id);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	const statusClass: Record<string, string> = {
		APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
		PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
		CHECKED_OUT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
		RETURNED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
		CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
	};

	const statusLabels: Record<string, string> = {
		APPROVED: 'Approved',
		PENDING: 'Pending',
		CHECKED_OUT: 'Checked out',
		RETURNED: 'Returned',
		CANCELLED: 'Released'
	};

	let editingAddress = $state(false);
	let savingAddress = $state(false);
	let addressDraft = $state({
		name: '',
		line1: '',
		line2: '',
		postalCode: '',
		city: ''
	});

	$effect(() => {
		if (editingAddress) return;
		addressDraft = {
			name: production.venueName ?? '',
			line1: production.address?.line1 ?? '',
			line2: production.address?.line2 ?? '',
			postalCode: production.address?.postalCode ?? '',
			city: production.address?.city ?? ''
		};
	});

	async function handleSaveAddress(e: Event) {
		e.preventDefault();
		savingAddress = true;
		try {
			await updateProductionAddress({ productionId, address: addressDraft });
			toast.success('Address updated');
			editingAddress = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingAddress = false;
		}
	}

	function formatAddress(venueName: string | null, addr: typeof production.address) {
		const parts = [
			venueName?.trim(),
			addr?.line1?.trim(),
			addr?.line2?.trim(),
			[addr?.postalCode?.trim(), addr?.city?.trim()].filter(Boolean).join(' ')
		].filter(Boolean);
		return parts.length ? parts.join(' · ') : '—';
	}

	let editingCustomer = $state(false);
	let savingCustomer = $state(false);
	let customerDraftId = $state('');

	$effect(() => {
		if (editingCustomer) return;
		customerDraftId = production.customerId ?? '';
	});

	async function handleSaveCustomer(e: Event) {
		e.preventDefault();
		savingCustomer = true;
		try {
			await updateProductionCustomer({ productionId, customerId: customerDraftId || undefined });
			toast.success('Customer updated');
			editingCustomer = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingCustomer = false;
		}
	}

	function toDateInput(d: Date | string | null | undefined) {
		if (!d) return '';
		return new Date(d).toISOString().slice(0, 10);
	}

	function formatDateRange(
		start: Date | string | null | undefined,
		end: Date | string | null | undefined
	) {
		if (!start && !end) return '—';
		const fmt = (d: Date | string) => new Date(d).toLocaleDateString('de-DE');
		if (start && end)
			return start === end || fmt(start) === fmt(end) ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
		return fmt((start ?? end)!);
	}

	let editingDuration = $state(false);
	let savingDuration = $state(false);
	let durationDraft = $state({
		startDate: '',
		endDate: '',
		sameAsTotalDuration: true,
		showStartDate: '',
		showEndDate: ''
	});

	$effect(() => {
		if (editingDuration) return;
		const hasCustomShow = !!(production.showStartDate || production.showEndDate);
		durationDraft = {
			startDate: toDateInput(production.startDate),
			endDate: toDateInput(production.endDate),
			sameAsTotalDuration: !hasCustomShow,
			showStartDate: toDateInput(production.showStartDate),
			showEndDate: toDateInput(production.showEndDate)
		};
	});

	async function handleSaveDuration(e: Event) {
		e.preventDefault();
		savingDuration = true;
		try {
			await updateProductionDuration({
				productionId,
				startDate: durationDraft.startDate ? new Date(durationDraft.startDate) : undefined,
				endDate: durationDraft.endDate ? new Date(durationDraft.endDate) : undefined,
				showStartDate:
					!durationDraft.sameAsTotalDuration && durationDraft.showStartDate
						? new Date(durationDraft.showStartDate)
						: undefined,
				showEndDate:
					!durationDraft.sameAsTotalDuration && durationDraft.showEndDate
						? new Date(durationDraft.showEndDate)
						: undefined
			});
			toast.success('Duration updated');
			editingDuration = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingDuration = false;
		}
	}

	// A license checked out here is what its crew needs the key for — this is
	// the page they will be on. Whether they may see it is the server's call.
	let credentialsFor = $state<{ assetId: string; label: string } | null>(null);
	let credentialsOpen = $state(false);
	let copyEquipmentOpen = $state(false);

	function openCredentials(asset: {
		id: string;
		assetTag: string | null;
		product: { name: string };
	}) {
		credentialsFor = {
			assetId: asset.id,
			label: asset.assetTag ? `${asset.product.name} · ${asset.assetTag}` : asset.product.name
		};
		credentialsOpen = true;
	}
</script>

<svelte:head><title>{production.name} | Technikpool</title></svelte:head>

<div class="space-y-6 {selectedItemAssetIds.size > 0 ? 'pb-20' : ''}">
	<!-- Header -->
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="text-3xl font-bold tracking-tight">{production.name}</h1>
				{#if cancelled}
					<span class="rounded bg-destructive/10 px-2 py-0.5 text-sm font-medium text-destructive"
						>Cancelled</span
					>
				{/if}
			</div>
			<p class="text-muted-foreground">
				Owned by {orgLabel(production.organization)} · {formatDateRange(
					production.startDate,
					production.endDate
				)}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button icon="back" variant="outline" href={resolve('/productions')}>Back</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} icon="print" variant="secondary">Print</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						align="end"
						sideOffset={4}
						class="z-50 min-w-[190px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
					>
						<DropdownMenu.Item
							onSelect={() => openPrint('packing-list')}
							class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
						>
							Packing List
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onSelect={() => openPrint('delivery-note')}
							class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
						>
							Delivery Note
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onSelect={() => openPrint('crew-passes')}
							class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
						>
							Crew Passes
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			{#if canManage}
				{#if currentOffer}
					<Button icon="forward" href={resolve(`/offers/${currentOffer.id}`)}>Open Offer</Button>
				{:else}
					<Button icon="add" href={resolve(`/offers/new?productionId=${production.id}`)}
						>Create Offer</Button
					>
				{/if}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								aria-label="More actions"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="currentColor"
								>
									<circle cx="5" cy="12" r="1.75" />
									<circle cx="12" cy="12" r="1.75" />
									<circle cx="19" cy="12" r="1.75" />
								</svg>
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Portal>
						<DropdownMenu.Content
							align="end"
							sideOffset={4}
							class="z-50 min-w-[190px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
						>
							{#if currentOffer}
								<DropdownMenu.Item
									onSelect={() => goto(resolve(`/offers/new?productionId=${production.id}`))}
									class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
								>
									New offer
								</DropdownMenu.Item>
								<DropdownMenu.Separator class="my-1 h-px bg-border" />
							{/if}
							{#if cancelled}
								<DropdownMenu.Item
									onSelect={() => (reopenOpen = true)}
									class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
								>
									Reopen production
								</DropdownMenu.Item>
							{:else}
								<DropdownMenu.Item
									onSelect={() => (cancelOpen = true)}
									class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
								>
									Cancel production
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator class="my-1 h-px bg-border" />
							<DropdownMenu.Item
								onSelect={() => (deleteOpen = true)}
								class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 data-[highlighted]:bg-destructive/10"
							>
								Delete production
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
			{/if}
		</div>
	</div>

	{#if production.cancelledAt}
		<div
			class="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
		>
			<div class="space-y-1">
				<p class="font-medium text-destructive">
					{#if production.cancelledBy}
						Cancelled on {new Date(production.cancelledAt).toLocaleDateString('de-DE')} by {production
							.cancelledBy.name || production.cancelledBy.email}
					{:else}
						Cancelled on {new Date(production.cancelledAt).toLocaleDateString('de-DE')}
					{/if}
				</p>
				<p class="text-sm whitespace-pre-line">{production.cancellationReason}</p>
				<p class="text-xs text-muted-foreground">
					Nothing is held back for it any more. Units that were already out on it are still returned
					by scanning them onto a location.
				</p>
			</div>
			{#if canManage}
				<Button variant="outline" onclick={() => (reopenOpen = true)}>Reopen</Button>
			{/if}
		</div>
	{/if}

	{#if !role}
		<!-- Nobody outside the org reaches this page but a lender (or a system
		     admin, who is given OWNER above) — see `productionVisibility`. -->
		<p class="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
			Your organization lends equipment to this production, so you can see it. Only {orgLabel(
				production.organization
			)} can change it.
		</p>
	{/if}

	<!--
	  Two columns from lg up: the equipment on the left, everything about the job
	  on the right — where the crew is in view without scrolling past the whole
	  equipment list. Stacked on a phone, the facts and the crew come first and
	  the rest of the sidebar after the equipment.
	-->
	<div
		class="grid gap-6 [grid-template-areas:'facts'_'equipment'_'more'] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'equipment_facts'_'equipment_more']"
	>
		<!-- Facts & crew -->
		<div class="space-y-6 [grid-area:facts]">
			<Card.Root>
				<Card.Header>
					<Card.Title>Details</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<!-- Duration -->
					<div class="space-y-3">
						<div class="flex items-start justify-between gap-2">
							<div class="space-y-2">
								<div>
									<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
										Total Duration
									</h3>
									<p class="text-sm">{formatDateRange(production.startDate, production.endDate)}</p>
								</div>
								<div>
									<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
										Show Duration
									</h3>
									<p class="text-sm">
										{formatDateRange(
											production.showStartDate ?? production.startDate,
											production.showEndDate ?? production.endDate
										)}
									</p>
								</div>
							</div>
							{#if canEdit && !editingDuration}
								<Button
									icon="edit"
									variant="ghost"
									size="icon-sm"
									aria-label="Edit duration"
									onclick={() => (editingDuration = true)}
								/>
							{/if}
						</div>

						{#if editingDuration}
							<form class="space-y-4" onsubmit={handleSaveDuration}>
								<div class="grid grid-cols-2 gap-3">
									<div class="space-y-2">
										<Label for="dur-startDate">Start Date</Label>
										<Input id="dur-startDate" type="date" bind:value={durationDraft.startDate} />
									</div>
									<div class="space-y-2">
										<Label for="dur-endDate">End Date</Label>
										<Input
											id="dur-endDate"
											type="date"
											bind:value={durationDraft.endDate}
											min={durationDraft.startDate}
										/>
									</div>
								</div>

								<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
									<input
										type="checkbox"
										bind:checked={durationDraft.sameAsTotalDuration}
										class="h-4 w-4 rounded border-input"
									/>
									Show duration same as total duration
								</label>

								{#if !durationDraft.sameAsTotalDuration}
									<div class="grid grid-cols-2 gap-3">
										<div class="space-y-2">
											<Label for="dur-showStartDate">Show Start Date</Label>
											<Input
												id="dur-showStartDate"
												type="date"
												bind:value={durationDraft.showStartDate}
												min={durationDraft.startDate}
												max={durationDraft.endDate}
											/>
										</div>
										<div class="space-y-2">
											<Label for="dur-showEndDate">Show End Date</Label>
											<Input
												id="dur-showEndDate"
												type="date"
												bind:value={durationDraft.showEndDate}
												min={durationDraft.showStartDate || durationDraft.startDate}
												max={durationDraft.endDate}
											/>
										</div>
									</div>
								{/if}

								<div class="flex justify-end gap-2">
									<Button
										icon="close"
										type="button"
										variant="outline"
										onclick={() => (editingDuration = false)}
									>
										Cancel
									</Button>
									<Button icon="save" type="submit" disabled={savingDuration}>
										{savingDuration ? 'Saving…' : 'Save'}
									</Button>
								</div>
							</form>
						{/if}
					</div>

					<!-- Address -->
					<div class="space-y-3 border-t pt-4">
						<div class="flex items-start justify-between gap-2">
							<div>
								<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									Address
								</h3>
								<p class="text-sm">{formatAddress(production.venueName, production.address)}</p>
							</div>
							{#if canEdit && !editingAddress}
								<Button
									icon="edit"
									variant="ghost"
									size="icon-sm"
									aria-label="Edit address"
									onclick={() => (editingAddress = true)}
								/>
							{/if}
						</div>

						{#if editingAddress}
							<form class="space-y-4" onsubmit={handleSaveAddress}>
								<AddressInput bind:value={addressDraft} idPrefix="addr" withName />

								<div class="flex justify-end gap-2">
									<Button
										icon="close"
										type="button"
										variant="outline"
										onclick={() => (editingAddress = false)}
									>
										Cancel
									</Button>
									<Button icon="save" type="submit" disabled={savingAddress}>
										{savingAddress ? 'Saving…' : 'Save'}
									</Button>
								</div>
							</form>
						{/if}
					</div>

					<!-- Customer -->
					<div class="space-y-3 border-t pt-4">
						<div class="flex items-start justify-between gap-2">
							<div>
								<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									Customer
								</h3>
								<p class="text-sm">
									{production.customer ? customerLabel(production.customer) : '—'}
								</p>
							</div>
							{#if canEdit && !editingCustomer}
								<Button
									icon="edit"
									variant="ghost"
									size="icon-sm"
									aria-label="Edit customer"
									onclick={() => (editingCustomer = true)}
								/>
							{/if}
						</div>

						{#if editingCustomer}
							<form class="space-y-4" onsubmit={handleSaveCustomer}>
								<CustomerSelect
									organizationId={production.organizationId}
									bind:value={customerDraftId}
									allowNone
									id="production-customer"
									idPrefix="prod-cust"
								/>

								<div class="flex justify-end gap-2">
									<Button
										icon="close"
										type="button"
										variant="outline"
										onclick={() => (editingCustomer = false)}
									>
										Cancel
									</Button>
									<Button icon="save" type="submit" disabled={savingCustomer}>
										{savingCustomer ? 'Saving…' : 'Save'}
									</Button>
								</div>
							</form>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Crew -->
			<Card.Root>
				<Card.Header>
					<Card.Title>
						Crew
						{#if production.crew.length > 0}
							<span class="ml-1 text-sm font-normal text-muted-foreground"
								>{production.crew.length}</span
							>
						{/if}
					</Card.Title>
					{#if canPlan && !showCrewForm}
						<Card.Action>
							<Button icon="add" variant="outline" size="sm" onclick={() => (showCrewForm = true)}
								>Add</Button
							>
						</Card.Action>
					{/if}
				</Card.Header>
				<Card.Content class="space-y-4">
					{#if showCrewForm}
						<form onsubmit={handleAddCrew} class="space-y-3 rounded-md border p-3">
							<div class="space-y-2">
								<Label for="crewUser">User *</Label>
								<select
									id="crewUser"
									bind:value={crewUserId}
									class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
									required
								>
									<option value="" disabled> Select a user… </option>
									{#each orgUsers as u (u.id)}
										{@const alreadyAdded = production.crew.some((c) => c.userId === u.id)}
										<option value={u.id} disabled={alreadyAdded}>
											{u.name || u.email}{alreadyAdded ? ' (already added)' : ''}
										</option>
									{/each}
								</select>
							</div>
							<div class="space-y-2">
								<Label for="crewRole">Role</Label>
								<Input id="crewRole" bind:value={crewRole} placeholder="Camera Operator" />
							</div>
							<div class="flex justify-end gap-2">
								<Button type="button" variant="outline" onclick={() => (showCrewForm = false)}
									>Cancel</Button
								>
								<Button icon="add" type="submit" disabled={savingCrew}
									>{savingCrew ? 'Adding…' : 'Add'}</Button
								>
							</div>
						</form>
					{/if}

					{#if production.crew.length === 0}
						<p class="text-sm text-muted-foreground">No crew members added yet.</p>
					{:else}
						<ul class="divide-y">
							{#each production.crew as member (member.id)}
								<li class="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
									<div class="min-w-0">
										<p class="truncate text-sm font-medium">
											{member.user.name || member.user.email}
											{#if member.role}
												<span class="font-normal text-muted-foreground">· {member.role}</span>
											{/if}
										</p>
										{#if member.user.name}
											<p class="truncate text-xs text-muted-foreground">{member.user.email}</p>
										{/if}
									</div>
									{#if canEdit}
										<button
											type="button"
											onclick={() => handleRemoveCrew(member.id)}
											class="shrink-0 text-xs text-muted-foreground transition-colors hover:text-destructive"
										>
											Remove
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Equipment -->
		<div class="min-w-0 [grid-area:equipment]">
			<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-xl font-semibold">
					Booked Equipment
					{#if unitCount > 0}
						<span class="ml-1 text-base font-normal text-muted-foreground">{unitCount}</span>
					{/if}
				</h2>
				{#if canPlan}
					<div class="flex flex-wrap gap-2">
						<Button variant="outline" onclick={() => (copyEquipmentOpen = true)}
							>Copy equipment from…</Button
						>
						<Button href={resolve(`/productions/${productionId}/equipment`)}
							>Manage Equipment</Button
						>
					</div>
				{/if}
			</div>

			{#if production.items.length === 0}
				<Card.Root>
					<Card.Content class="py-12 text-center text-muted-foreground">
						No equipment booked yet.
					</Card.Content>
				</Card.Root>
			{:else}
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b bg-muted/30">
								<th class="w-10 px-4 py-3">
									<input
										type="checkbox"
										checked={allItemsSelected}
										use:indeterminate={someItemsSelected && !allItemsSelected}
										onclick={toggleSelectAllItems}
										class="h-4 w-4 cursor-pointer rounded border-input"
									/>
								</th>
								<th class="px-3 py-3 text-left font-medium text-muted-foreground">Product</th>
								<th class="px-3 py-3 text-right font-medium text-muted-foreground">Total</th>
								<th class="px-3 py-3 text-right font-medium text-muted-foreground">Pending</th>
								<th class="px-3 py-3 text-right font-medium text-muted-foreground">Approved</th>
								<th class="px-3 py-3 text-right font-medium text-muted-foreground">Out</th>
								<th class="px-3 py-3 text-right font-medium text-muted-foreground">Returned</th>
							</tr>
						</thead>
						<tbody>
							{#each displaySections as section (section.kind === 'bundle' ? section.bundleId : section.productId)}
								{@const sectionId =
									section.kind === 'bundle' ? section.bundleId : section.productId}
								{@const sectionAssetIds = section.items.map((i) => i.asset.id)}
								{@const allInSectionSelected =
									sectionAssetIds.length > 0 &&
									sectionAssetIds.every((id) => selectedItemAssetIds.has(id))}
								{@const divergence =
									section.kind === 'bundle' ? bundleDivergence.get(section.bundleId) : null}
								<tr
									class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
									onclick={() => toggleSection(sectionId)}
								>
									<td class="px-4 py-3">
										<input
											type="checkbox"
											checked={allInSectionSelected}
											onclick={(e) => {
												e.stopPropagation();
												if (allInSectionSelected) {
													sectionAssetIds.forEach((id) => selectedItemAssetIds.delete(id));
												} else {
													sectionAssetIds.forEach((id) => selectedItemAssetIds.add(id));
												}
											}}
											class="h-4 w-4 cursor-pointer rounded border-input"
										/>
									</td>
									<td class="px-3 py-3">
										<div class="flex items-center gap-2">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												class="shrink-0 text-muted-foreground transition-transform {expanded.get(
													sectionId
												)
													? 'rotate-90'
													: ''}"
											>
												<path d="m9 18 6-6-6-6" />
											</svg>
											{#if section.kind === 'bundle'}
												<span
													class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
													>Bundle</span
												>
												<span class="font-medium">{section.bundleName}</span>
												{#if canPlan && divergence}
													<span
														class="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
														title="{divergence.addedCount > 0
															? `${divergence.addedCount} new asset${divergence.addedCount !== 1 ? 's' : ''} in bundle`
															: ''}{divergence.addedCount > 0 && divergence.removedCount > 0
															? ', '
															: ''}{divergence.removedCount > 0
															? `${divergence.removedCount} asset${divergence.removedCount !== 1 ? 's' : ''} removed from bundle`
															: ''}">Bundle changed</span
													>
													<button
														type="button"
														disabled={working}
														onclick={(e) => {
															e.stopPropagation();
															handleSyncBundle(section.bundleId);
														}}
														class="rounded border border-yellow-400 px-2 py-0.5 text-xs text-yellow-800 transition-colors hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-300 dark:hover:bg-yellow-900/40"
													>
														Update from bundle
													</button>
												{/if}
												{#if canEdit}
													<button
														type="button"
														onclick={(e) => {
															e.stopPropagation();
															handleRemoveBundle(section.bundleId);
														}}
														class="ml-auto text-xs text-muted-foreground transition-colors hover:text-destructive"
													>
														Remove
													</button>
												{/if}
											{:else}
												<ProductThumb path={section.imagePath} alt={section.productName} />
												<div class="min-w-0">
													<p class="font-medium">{section.productName}</p>
													{#if section.manufacturerName}
														<p class="text-xs text-muted-foreground">{section.manufacturerName}</p>
													{/if}
												</div>
											{/if}
										</div>
									</td>
									<td class="px-3 py-3 text-right font-mono tabular-nums">{section.total}</td>
									<td
										class="px-3 py-3 text-right font-mono tabular-nums {section.pending > 0
											? 'text-yellow-600 dark:text-yellow-400'
											: 'text-muted-foreground'}">{section.pending > 0 ? section.pending : '—'}</td
									>
									<td
										class="px-3 py-3 text-right font-mono tabular-nums {section.approved > 0
											? 'text-green-700 dark:text-green-400'
											: 'text-muted-foreground'}"
										>{section.approved > 0 ? section.approved : '—'}</td
									>
									<td
										class="px-3 py-3 text-right font-mono tabular-nums {section.checkedOut > 0
											? 'text-blue-600 dark:text-blue-400'
											: 'text-muted-foreground'}"
										>{section.checkedOut > 0 ? section.checkedOut : '—'}</td
									>
									<td class="px-3 py-3 text-right font-mono text-muted-foreground tabular-nums"
										>{section.returned > 0 ? section.returned : '—'}</td
									>
								</tr>
								{#if expanded.get(sectionId)}
									{#each section.items as item (item.id)}
										<tr class="border-b bg-muted/10 last:border-0">
											<td class="px-4 py-2">
												<input
													type="checkbox"
													checked={selectedItemAssetIds.has(item.asset.id)}
													onclick={() => {
														if (selectedItemAssetIds.has(item.asset.id)) {
															selectedItemAssetIds.delete(item.asset.id);
														} else {
															selectedItemAssetIds.add(item.asset.id);
														}
													}}
													class="h-4 w-4 cursor-pointer rounded border-input"
												/>
											</td>
											<td colspan="6" class="px-3 py-2">
												<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
													{#if section.kind === 'bundle'}
														<ProductThumb
															path={item.asset.product.imagePath}
															alt={item.asset.product.name}
															size={22}
														/>
														<span class="font-medium">{item.asset.product.name}</span>
													{/if}
													<span class="w-36 font-mono text-xs text-muted-foreground">
														{item.asset.serialNumber ? `S/N: ${item.asset.serialNumber}` : '—'}
													</span>
													<span class="text-xs text-muted-foreground"
														>{orgLabel(item.asset.organization)}</span
													>
													<span
														class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {statusClass[
															item.status
														] ?? ''}">{statusLabels[item.status] ?? item.status}</span
													>
													{#if item.asset.product.isLicense && item.status === 'CHECKED_OUT'}
														<button
															type="button"
															onclick={() => openCredentials(item.asset)}
															class="rounded border px-2 py-0.5 text-xs transition-colors hover:bg-muted"
														>
															Credentials
														</button>
													{/if}
													{#if canPlan && accessoriesChanged(item)}
														<span
															class="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
															>Accessories changed</span
														>
														<button
															type="button"
															disabled={working}
															onclick={() => handleSyncAccessories(item.assetId)}
															class="rounded border border-yellow-400 px-2 py-0.5 text-xs text-yellow-800 transition-colors hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-300 dark:hover:bg-yellow-900/40"
														>
															Update accessories
														</button>
													{/if}
													{#if canEdit}
														<button
															type="button"
															onclick={() => handleRemoveItem(item.id)}
															class="ml-auto text-xs text-muted-foreground transition-colors hover:text-destructive"
														>
															Remove
														</button>
													{/if}
												</div>
												{#if item.accessories.length > 0}
													<!-- Attached to this unit, so booked and removed with it —
													     never a line of its own. -->
													<p class="mt-1 pl-6 text-xs text-muted-foreground">
														↳ {accessorySummary(item.accessories)}
													</p>
												{/if}
											</td>
										</tr>
									{/each}
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<!-- Billing & access -->
		<div class="space-y-6 [grid-area:more]">
			{#if canManage}
				<Card.Root>
					<Card.Header>
						<Card.Title>Offers</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if offers.length === 0}
							<p class="text-sm text-muted-foreground">No offers yet.</p>
						{:else}
							<div class="space-y-2">
								{#each offers as offer (offer.id)}
									<a
										href={resolve(`/offers/${offer.id}`)}
										class="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/30"
									>
										<div class="min-w-0">
											<p class="truncate font-medium">{offer.number} — {offer.customerName}</p>
											<p class="text-xs text-muted-foreground">
												{offer.dayCount} d
												{#if supersededOffers.has(offer.id)}
													· Superseded
												{/if}
												{#if offer.invoices.length > 0}
													· Invoiced ({offer.invoices[0].number})
												{/if}
											</p>
										</div>
										<span class="shrink-0 font-medium tabular-nums"
											>{fmtEUR(offerTotal(offer))}</span
										>
									</a>
								{/each}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title>Invoices</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if invoices.length === 0}
							<p class="text-sm text-muted-foreground">
								No invoices yet — an invoice is created from an offer.
							</p>
						{:else}
							<div class="space-y-2">
								{#each invoices as invoice (invoice.id)}
									<a
										href={resolve(`/invoices/${invoice.id}`)}
										class="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/30"
									>
										<div>
											<p class="font-medium">{invoice.number}</p>
											<p class="text-xs text-muted-foreground">
												{invoice.dayCount} d · {invoice.sentAt ? 'Sent' : 'Draft'}
											</p>
										</div>
										<span class="shrink-0 font-medium tabular-nums"
											>{fmtEUR(invoiceTotal(invoice))}</span
										>
									</a>
								{/each}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}

			{#if audienceQuery}
				<Card.Root>
					<Card.Header>
						<Card.Title>Who can see this</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-3">
						{#if !audienceQuery.ready || !audience}
							<ContentSkeleton shape="rows" count={3} error={audienceQuery.error} />
						{:else}
							<p class="text-sm text-muted-foreground">
								{plural(audience.orgReaderCount, [
									'# member of your organization (Viewer and up)',
									'# members of your organization (Viewer and up)'
								])}
							</p>
							{#if audience.people.length > 0}
								<ul class="divide-y">
									{#each audience.people as person (person.user.id)}
										<li class="space-y-1 py-2 first:pt-0 last:pb-0">
											<p class="truncate text-sm font-medium">
												{person.user.name || person.user.email}
											</p>
											<div class="flex flex-wrap gap-1">
												{#each person.reasons as reason, i (i)}
													{#if reason.kind === 'crew'}
														<span
															class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
															>Crew{reason.role ? ` · ${reason.role}` : ''}</span
														>
													{:else}
														<span
															class="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400"
															>Lends equipment · {reason.orgName}</span
														>
													{/if}
												{/each}
											</div>
										</li>
									{/each}
								</ul>
							{/if}
							{#if audience.lenderOrgCount > 0}
								<p class="text-xs text-muted-foreground">
									Everyone from Viewer up in an organization whose equipment is booked or requested
									here can open this production, customer included — but not its offers and
									invoices. A declined request no longer counts.
								</p>
							{/if}
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>
</div>

<BulkActionsBar selectedIds={selectedItemAssetIds} onClear={() => selectedItemAssetIds.clear()} />

<Modal bind:open={deleteOpen} title="Delete production" dismissible={!deleting}>
	{#snippet description()}
		This permanently deletes the production, its equipment bookings, and its crew assignments.
		Existing offers and invoices are preserved but will no longer be linked to this production.
	{/snippet}
	{#snippet children()}
		<p class="text-sm">
			Delete <span class="font-medium">{production.name}</span>?
		</p>
	{/snippet}
	{#snippet footer()}
		<Button variant="outline" disabled={deleting} onclick={() => (deleteOpen = false)}
			>Cancel</Button
		>
		<Button variant="destructive" disabled={deleting} onclick={handleDeleteProduction}>
			{deleting ? 'Deleting…' : 'Delete production'}
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={cancelOpen} title="Cancel production" size="md" dismissible={!cancelling}>
	{#snippet children()}
		<div class="space-y-4">
			<p class="text-sm text-muted-foreground">
				<span class="font-medium text-foreground">{production.name}</span> stays on record with its offers
				and invoices, but holds nothing back any more.
			</p>
			<ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
				<li>
					{plural(releasableCount, [
						'# booking or open request is released',
						'# bookings and open requests are released'
					])}
				</li>
				{#if checkedOutCount > 0}
					<li>
						{plural(checkedOutCount, [
							'# unit is checked out and stays out until it is scanned back',
							'# units are checked out and stay out until they are scanned back'
						])}
					</li>
				{/if}
				<li>The crew and any organization lending units to it are told by email</li>
			</ul>
			<div class="space-y-2">
				<Label for="cancelReason">Reason *</Label>
				<textarea
					id="cancelReason"
					bind:value={cancelReason}
					rows="3"
					placeholder="Customer called off the event"
					class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
			</div>
		</div>
	{/snippet}
	{#snippet footer()}
		<Button variant="outline" disabled={cancelling} onclick={() => (cancelOpen = false)}
			>Keep production</Button
		>
		<Button
			variant="destructive"
			disabled={cancelling || !cancelReason.trim()}
			onclick={handleCancelProduction}
		>
			{cancelling ? 'Cancelling…' : 'Cancel production'}
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={reopenOpen} title="Reopen production" size="md" dismissible={!reopening}>
	{#snippet children()}
		<div class="space-y-3 text-sm text-muted-foreground">
			<p>
				What the cancellation released is booked again for
				<span class="font-medium text-foreground">{production.name}</span>, as far as it is still
				free.
			</p>
			<ul class="list-disc space-y-1 pl-5">
				<li>Units of your own organization are booked straight away</li>
				<li>Units of other organizations go back to their owners as requests</li>
				<li>A unit booked elsewhere for these days in the meantime is removed</li>
			</ul>
		</div>
	{/snippet}
	{#snippet footer()}
		<Button variant="outline" disabled={reopening} onclick={() => (reopenOpen = false)}
			>Cancel</Button
		>
		<Button disabled={reopening} onclick={handleReopenProduction}>
			{reopening ? 'Reopening…' : 'Reopen production'}
		</Button>
	{/snippet}
</Modal>

<LicenseRevealModal
	bind:open={credentialsOpen}
	assetId={credentialsFor?.assetId ?? null}
	title={credentialsFor?.label ?? ''}
/>

{#if canPlan}
	<CopyEquipmentModal
		{productionId}
		organizationId={production.organizationId}
		bind:open={copyEquipmentOpen}
	/>
{/if}
