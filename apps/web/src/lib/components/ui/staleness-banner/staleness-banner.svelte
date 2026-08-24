<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import type { Staleness } from './types';

	let {
		staleness,
		onUpdate
	}: {
		staleness: Staleness;
		onUpdate: () => Promise<void>;
	} = $props();

	let open = $state(false);
	let working = $state(false);

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	async function handleUpdate() {
		working = true;
		try {
			await onUpdate();
			toast.success('Items updated');
			open = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}
</script>

{#if staleness.applicable && (staleness.stale || staleness.error)}
	<Card.Root class="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
		<Card.Content class="flex flex-wrap items-center justify-between gap-3 py-4">
			<div class="text-sm">
				{#if staleness.error}
					<p class="font-medium text-amber-900 dark:text-amber-200">Can't check for updates</p>
					<p class="text-amber-800/80 dark:text-amber-300/80">{staleness.error}</p>
				{:else}
					<p class="font-medium text-amber-900 dark:text-amber-200">Items are out of date</p>
					<p class="text-amber-800/80 dark:text-amber-300/80">
						The production's booked equipment has changed since these items were set.
					</p>
				{/if}
			</div>
			{#if !staleness.error}
				<Button size="sm" onclick={() => (open = true)}>Review & Update</Button>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={(e) => e.key === 'Escape' && (open = false)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mx-4 w-full max-w-xl rounded-lg border bg-background p-6 shadow-lg"
			onkeydown={(e) => e.stopPropagation()}
		>
			<h2 class="mb-1 text-lg font-semibold">Update items</h2>
			<p class="mb-4 text-sm text-muted-foreground">
				This replaces the current line items with what's booked on the production now.
			</p>

			<div class="max-h-80 space-y-3 overflow-y-auto text-sm">
				{#if staleness.added.length > 0}
					<div>
						<p class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Added
						</p>
						<div class="space-y-1">
							{#each staleness.added as line (line.key)}
								<div
									class="flex justify-between rounded-md bg-green-50 px-2 py-1 dark:bg-green-950/40"
								>
									<span>{line.description}</span>
									<span class="text-green-700 tabular-nums dark:text-green-400"
										>+{fmtEUR(line.lineTotal)}</span
									>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				{#if staleness.removed.length > 0}
					<div>
						<p class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Removed
						</p>
						<div class="space-y-1">
							{#each staleness.removed as line (line.key)}
								<div class="flex justify-between rounded-md bg-red-50 px-2 py-1 dark:bg-red-950/40">
									<span class="line-through">{line.description}</span>
									<span class="text-red-700 tabular-nums dark:text-red-400"
										>−{fmtEUR(line.lineTotal)}</span
									>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				{#if staleness.changed.length > 0}
					<div>
						<p class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Changed
						</p>
						<div class="space-y-1">
							{#each staleness.changed as line (line.key)}
								<div class="flex justify-between rounded-md bg-muted/50 px-2 py-1">
									<span>{line.description}</span>
									<span class="tabular-nums">{fmtEUR(line.before)} → {fmtEUR(line.after)}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<div class="mt-6 flex justify-end gap-3">
				<Button type="button" variant="outline" onclick={() => (open = false)} disabled={working}>
					Cancel
				</Button>
				<Button type="button" onclick={handleUpdate} disabled={working}>
					{working ? 'Updating…' : 'Update Items'}
				</Button>
			</div>
		</div>
	</div>
{/if}
