<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getHandoutSummary } from '#lib/remote/production-handout.remote.js';

	// "Hand out" and "Take back": the production's list, ticked into bookings.
	// Only for someone with units on it to book; not awaited, so the production
	// page never waits on it.

	let { productionId, cancelled }: { productionId: string; cancelled: boolean } = $props();

	let summaryQuery = $derived(getHandoutSummary(productionId));
	let summary = $derived(summaryQuery.current);
	// Booked and still on the shelf, kit members added since the kit was
	// booked, and — while the production runs — what was taken back, which may
	// have been a mistake. Only the first two are counted: the last is offered,
	// not owed.
	let toHandOut = $derived(summary ? summary.approved + summary.kitAdditions : 0);
	let offersHandout = $derived(
		!!summary && !cancelled && (toHandOut > 0 || (summary.running && summary.returned > 0))
	);
</script>

{#if summary}
	{#if offersHandout}
		<Button variant="secondary" href={resolve(`productions/${productionId}/checkout`)}
			>{toHandOut > 0 ? `Hand out (${toHandOut})` : 'Hand out'}</Button
		>
	{/if}
	{#if summary.checkedOut > 0}
		<Button variant="secondary" href={resolve(`productions/${productionId}/checkin`)}
			>Take back ({summary.checkedOut})</Button
		>
	{/if}
{/if}
