<script lang="ts">
	// A product with a mains connector — Schuko, C13/C14, powerCON, TRUE1, CEE —
	// is electrical equipment, which needs DGUV V3 inspections. Where such a
	// product isn't marked as needing them, this says so and offers to mark it.
	// Read without awaiting: it sits inside detail pages, and a hint is not worth
	// holding them back for. See CLAUDE.md, "Loading states".
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		getMainsConnectors,
		setProductInspectionRequirement
	} from '#lib/remote/inspections.remote.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';
	import { Zap } from '@lucide/svelte';

	type Props = {
		productId: string;
		/** Whether the product already needs inspecting — then there is nothing to say. */
		required: boolean;
	};

	let { productId, required }: Props = $props();

	let mainsQuery = $derived(getMainsConnectors(productId));
	let names = $derived(mainsQuery.current ?? []);
	let saving = $state(false);

	async function mark() {
		saving = true;
		try {
			const result = await setProductInspectionRequirement({
				productId,
				requiresInspection: true
			});
			toast.success(plural(result.changed, ['Saved · 1 unit changed', 'Saved · # units changed']));
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

{#if !required && names.length > 0}
	<div
		class="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
	>
		<Zap aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
		<div class="min-w-0 flex-1 space-y-2">
			<p>
				It has a mains connection ({names.join(', ')}), so its devices most likely need DGUV V3
				inspections — but the product is not marked as needing them.
			</p>
			<Button size="sm" variant="outline" disabled={saving} onclick={mark}
				>Mark as needing inspection</Button
			>
		</div>
	</div>
{/if}
