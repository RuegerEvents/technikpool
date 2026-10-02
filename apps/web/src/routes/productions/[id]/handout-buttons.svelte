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
</script>

{#if summary}
	{#if !cancelled && summary.approved > 0}
		<Button variant="secondary" href={resolve(`productions/${productionId}/checkout`)}
			>Hand out ({summary.approved})</Button
		>
	{/if}
	{#if summary.checkedOut > 0}
		<Button variant="secondary" href={resolve(`productions/${productionId}/checkin`)}
			>Take back ({summary.checkedOut})</Button
		>
	{/if}
{/if}
