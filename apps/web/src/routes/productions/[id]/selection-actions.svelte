<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { canWrite } from '#lib/roles.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import { confirmAction } from '#lib/confirm.svelte.js';
	import { getMyOrgs } from '#lib/remote/orgs.remote.js';
	import { setProductionHandoutDone } from '#lib/remote/production-handout.remote.js';
	import {
		getProductionChecks,
		startProductionCheck,
		tickProductionCheck
	} from '#lib/remote/production-checks.remote.js';

	// What a selection on the production page is for: handing it out to this
	// production, taking it back, or ticking it in a check — the same three as
	// the buttons above the list, narrowed to the units picked. Each counts only
	// the units this user books (a lender its own), the way the handout list
	// does, so a button never offers what the server would refuse.
	// Not awaited: the bar must not hold the page back.

	type SelectedItem = { status: string; asset: { id: string; organizationId: string } };

	let {
		productionId,
		cancelled,
		items,
		onDone
	}: {
		productionId: string;
		cancelled: boolean;
		items: SelectedItem[];
		onDone: () => void;
	} = $props();

	let orgsQuery = $derived(getMyOrgs());
	let checksQuery = $derived(getProductionChecks(productionId));
	let writableOrgIds = $derived(
		new Set((orgsQuery.current ?? []).filter(canWrite).map((org) => org.id))
	);
	let bookable = $derived(
		items.filter((i) => page.data.isAdmin || writableOrgIds.has(i.asset.organizationId))
	);
	let toHandOut = $derived(bookable.filter((i) => i.status === 'APPROVED'));
	let toTakeBack = $derived(bookable.filter((i) => i.status === 'CHECKED_OUT'));

	// The check whose list holds the whole selection: the production's own sees
	// every unit, a lender's only its own.
	let checkable = $derived(items.filter((i) => ['APPROVED', 'CHECKED_OUT'].includes(i.status)));
	let checkSide = $derived.by(() => {
		const sides = checksQuery.current?.sides ?? [];
		const own = sides.find((s) => s.own);
		if (own) return own;
		const owners = new Set(checkable.map((i) => i.asset.organizationId));
		return owners.size === 1 ? sides.find((s) => owners.has(s.organizationId)) : undefined;
	});

	let working = $state(false);

	async function handout(mode: 'checkout' | 'checkin', selected: SelectedItem[]) {
		const ok = await confirmAction(
			mode === 'checkout'
				? {
						title: plural(selected.length, ['Hand out 1 unit?', 'Hand out # units?']),
						description: 'They are checked out to this production right away.',
						confirmLabel: 'Hand out'
					}
				: {
						title: plural(selected.length, ['Take back 1 unit?', 'Take back # units?']),
						description: 'They go back onto the shelf they are kept on right away.',
						confirmLabel: 'Take back'
					}
		);
		if (!ok) return;
		working = true;
		try {
			const { count } = await setProductionHandoutDone({
				productionId,
				mode,
				assetIds: selected.map((i) => i.asset.id),
				done: true
			});
			toast.success(mode === 'checkout' ? `Handed out: ${count}` : `Taken back: ${count}`);
			onDone();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	async function check() {
		if (!checkSide) return;
		working = true;
		try {
			const started = await startProductionCheck({
				productionId,
				organizationId: checkSide.organizationId
			});
			await tickProductionCheck({
				checkId: started.id,
				assetIds: checkable.map((i) => i.asset.id)
			});
			onDone();
			await goto(resolve(`productions/${productionId}/check/${started.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}
</script>

{#if !cancelled && toHandOut.length > 0}
	<Button
		icon="forward"
		size="sm"
		variant="secondary"
		disabled={working}
		onclick={() => handout('checkout', toHandOut)}>Hand out ({toHandOut.length})</Button
	>
{/if}
{#if toTakeBack.length > 0}
	<Button
		icon="back"
		size="sm"
		variant="secondary"
		disabled={working}
		onclick={() => handout('checkin', toTakeBack)}>Take back ({toTakeBack.length})</Button
	>
{/if}
{#if checkSide && checkable.length > 0}
	<Button icon="confirm" size="sm" variant="secondary" disabled={working} onclick={check}
		>Check ({checkable.length})</Button
	>
{/if}
