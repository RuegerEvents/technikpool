<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import type { IssuedInvitation } from '.';

	/**
	 * The link of an invitation that was just issued. Only its hash is stored, so
	 * this is the one moment it can be shown — which matters most when the mail
	 * did not go out and the inviter has to pass it on by hand.
	 */
	let { issued, onclose }: { issued: IssuedInvitation; onclose: () => void } = $props();

	async function copy() {
		try {
			await navigator.clipboard.writeText(issued.url);
			toast.success('Link copied');
		} catch (err) {
			toast.error((err as Error).message);
		}
	}
</script>

<div class="space-y-2 rounded-md border border-dashed p-3 text-sm">
	{#if issued.mailed}
		<p>
			Invitation sent to <span class="font-medium">{issued.email}</span>. You can also pass the link
			on yourself. It is shown only once.
		</p>
	{:else}
		<p class="font-medium text-destructive">
			The email to {issued.email} could not be sent. Pass this link on yourself. It is shown only once.
		</p>
	{/if}
	<div class="flex gap-2">
		<Input value={issued.url} readonly class="font-mono text-xs" />
		<Button icon="copy" variant="outline" onclick={copy}>Copy</Button>
		<Button icon="close" variant="ghost" onclick={onclose}>Close</Button>
	</div>
</div>
