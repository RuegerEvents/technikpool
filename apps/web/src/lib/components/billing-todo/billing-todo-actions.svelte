<script lang="ts">
	// What to do about a production that still has to be invoiced: go and
	// invoice it, or say it was settled outside the app and stop being reminded.
	// Shared by the dashboard's list and the production page's banner.
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { dismissBillingTodo, restoreBillingTodo } from '#lib/remote/billing.remote.js';
	import { getErrorMessage } from '#lib/utils.js';

	type Props = {
		todo: {
			productionId: string;
			organizationId: string;
			side: 'customer' | 'lender';
			draftInvoiceId: string | null;
			offerId: string | null;
		};
	};

	let { todo }: Props = $props();
	let busy = $state(false);

	// A draft invoice is finished, an offer is turned into one, and without
	// either the first step is the offer.
	let href = $derived(
		todo.draftInvoiceId
			? resolve(`invoices/${todo.draftInvoiceId}`)
			: todo.offerId
				? resolve(`offers/${todo.offerId}`)
				: todo.side === 'lender'
					? resolve(`offers/new?productionId=${todo.productionId}&org=${todo.organizationId}`)
					: resolve(`offers/new?productionId=${todo.productionId}`)
	);

	async function dismiss() {
		busy = true;
		const ref = { productionId: todo.productionId, organizationId: todo.organizationId };
		try {
			await dismissBillingTodo(ref);
			toast.success('Marked as settled outside the app', {
				action: {
					label: 'Undo',
					onClick: () => {
						restoreBillingTodo(ref).catch((err) => toast.error(getErrorMessage(err)));
					}
				}
			});
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex shrink-0 items-center gap-1.5">
	<Button
		variant="ghost"
		size="sm"
		disabled={busy}
		onclick={dismiss}
		title="Settled outside the app — stop reminding">Settled elsewhere</Button
	>
	<Button variant="outline" size="sm" {href}
		>{todo.draftInvoiceId ? 'Finish invoice' : 'Invoice'}</Button
	>
</div>
