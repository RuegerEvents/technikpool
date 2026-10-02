<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { DropdownMenu } from 'bits-ui';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getErrorMessage } from '#lib/utils.js';
	import {
		getProductionChecks,
		startProductionCheck
	} from '#lib/remote/production-checks.remote.js';

	// "Check": join this side's open check, or start one. Someone in both the
	// production's org and a lending one picks which list they check.
	// Not awaited — the production page must not wait on it.

	let { productionId }: { productionId: string } = $props();

	let checksQuery = $derived(getProductionChecks(productionId));
	let sides = $derived(checksQuery.current?.sides ?? []);
	let openOrgIds = $derived(
		new Set(
			(checksQuery.current?.checks ?? [])
				.filter((c) => c.status === 'OPEN')
				.map((c) => c.organizationId)
		)
	);
	let starting = $state(false);

	async function start(organizationId: string) {
		starting = true;
		try {
			const check = await startProductionCheck({ productionId, organizationId });
			await goto(resolve(`productions/${productionId}/check/${check.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			starting = false;
		}
	}
</script>

{#if sides.length === 1}
	<Button
		icon="confirm"
		variant="secondary"
		disabled={starting}
		onclick={() => start(sides[0].organizationId)}
		>{openOrgIds.has(sides[0].organizationId) ? 'Continue check' : 'Check equipment'}</Button
	>
{:else if sides.length > 1}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} icon="confirm" variant="secondary" disabled={starting}
					>Check equipment</Button
				>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Portal>
			<DropdownMenu.Content
				align="end"
				sideOffset={4}
				class="z-50 min-w-[220px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
			>
				{#each sides as side (side.organizationId)}
					<DropdownMenu.Item
						onSelect={() => start(side.organizationId)}
						class="flex cursor-pointer flex-col items-start rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
					>
						<span
							>{side.own
								? 'Everything on the production'
								: `Units of ${side.organizationName}`}</span
						>
						{#if openOrgIds.has(side.organizationId)}
							<span class="text-xs text-muted-foreground">A check is open</span>
						{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	</DropdownMenu.Root>
{/if}
