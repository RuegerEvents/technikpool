<script lang="ts">
	// Sends the production's noted loans (DRAFT) to the orgs that own them. One
	// send carries one answer to "is this production paid?" and one note, which
	// every lender asked in it reads alongside its own units.
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { sendLoanRequests } from '#lib/remote/productions.remote.js';
	import { getErrorMessage, orgLabel, plural } from '#lib/utils.js';
	import type { DraftLender } from '#lib/production-items.js';

	type Props = {
		open: boolean;
		productionId: string;
		lenders: DraftLender[];
	};

	let { open = $bindable(), productionId, lenders }: Props = $props();

	let unpaid = $state(false);
	let note = $state('');
	let sending = $state(false);

	let total = $derived(lenders.reduce((sum, l) => sum + l.units, 0));

	async function send() {
		sending = true;
		try {
			const { sent, held } = await sendLoanRequests({
				productionId,
				unpaid,
				note: note.trim() || undefined
			});
			if (held > 0) {
				toast.warning(
					plural(sent, ['# device requested.', '# devices requested.']) +
						' ' +
						plural(held, [
							'# device was booked elsewhere in the meantime and stays noted.',
							'# devices were booked elsewhere in the meantime and stay noted.'
						])
				);
			} else {
				toast.success(plural(sent, ['# device requested.', '# devices requested.']));
			}
			open = false;
			unpaid = false;
			note = '';
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			sending = false;
		}
	}
</script>

<Modal bind:open title="Request equipment" size="md" dismissible={!sending}>
	{#snippet children()}
		<div class="space-y-4">
			<ul class="divide-y rounded-lg border text-sm">
				{#each lenders as lender (lender.id)}
					<li class="flex items-center justify-between gap-3 px-3 py-2">
						<span class="font-medium">{orgLabel(lender)}</span>
						<span class="text-muted-foreground"
							>{plural(lender.units, ['# device', '# devices'])}</span
						>
					</li>
				{/each}
			</ul>

			<label class="flex cursor-pointer items-start gap-2 text-sm select-none">
				<input type="checkbox" bind:checked={unpaid} class="mt-0.5 h-4 w-4 rounded border-input" />
				<span>
					<span class="font-medium">Unpaid production</span>
					<span class="block text-muted-foreground"
						>Ask the lenders to lend the equipment free of charge. Each of them decides when
						approving.</span
					>
				</span>
			</label>

			<div class="space-y-2">
				<Label for="loanRequestNote">Note (optional)</Label>
				<textarea
					id="loanRequestNote"
					bind:value={note}
					rows="3"
					placeholder="Charity gig, we pick it up on Friday"
					class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
			</div>
		</div>
	{/snippet}
	{#snippet footer()}
		<Button disabled={sending || total === 0} onclick={send}>
			{sending ? 'Sending…' : plural(total, ['Request # device', 'Request # devices'])}
		</Button>
		<Button variant="outline" disabled={sending} onclick={() => (open = false)}>Cancel</Button>
	{/snippet}
</Modal>
