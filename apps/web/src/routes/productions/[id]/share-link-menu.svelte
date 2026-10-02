<script lang="ts">
	// The customer's info link for this production, as a menu beside Print:
	// create it, copy or open it, replace or withdraw it. What the customer sees
	// behind it is /share/…; what makes it valid is production-share.ts.
	import { DropdownMenu } from 'bits-ui';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { getShareLink, setShareLink } from '#lib/remote/productions.remote.js';

	let { productionId }: { productionId: string } = $props();

	let linkQuery = $derived(getShareLink(productionId));
	let link = $derived(linkQuery.current ?? null);
	let working = $state(false);
	let confirming = $state<'create' | 'revoke' | null>(null);
	let confirmOpen = $state(false);

	async function run(action: 'create' | 'revoke') {
		working = true;
		try {
			await setShareLink({ productionId, action });
			confirmOpen = false;
			if (action === 'create') {
				// A new link is made to be sent, so it goes straight to the clipboard.
				const fresh = await getShareLink(productionId);
				if (fresh?.url) await copy(fresh.url, 'Link created and copied');
				else toast.success('Link created');
			} else {
				toast.success('Link withdrawn');
			}
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	async function copy(url: string, message = 'Link copied') {
		try {
			await navigator.clipboard.writeText(url);
			toast.success(message);
		} catch {
			toast.error('Could not copy the link.');
		}
	}

	function ask(action: 'create' | 'revoke') {
		confirming = action;
		confirmOpen = true;
	}

	const itemClass =
		'flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent';
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} icon="share" variant="secondary" disabled={working}>Customer link</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			align="end"
			sideOffset={4}
			class="z-50 w-64 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
		>
			<p class="px-2 pt-1.5 pb-2 text-xs text-muted-foreground">
				{#if !link}
					A page for the customer with the booked equipment, the manuals and a packing checklist —
					no account needed, no prices.
				{:else if link.expired}
					The production ended more than 30 days ago, so the link no longer opens.
				{:else if link.expiresAt}
					Anyone with the link can open it, until {new Date(link.expiresAt).toLocaleDateString(
						'de-DE'
					)}.
				{:else}
					Anyone with the link can open it.
				{/if}
			</p>
			{#if !link}
				<DropdownMenu.Item class={itemClass} onSelect={() => run('create')}>
					Create and copy link
				</DropdownMenu.Item>
			{:else}
				{#if !link.expired}
					<DropdownMenu.Item class={itemClass} onSelect={() => copy(link.url)}>
						Copy link
					</DropdownMenu.Item>
					<DropdownMenu.Item
						class={itemClass}
						onSelect={() => window.open(link.url, '_blank', 'noopener')}
					>
						Open as the customer sees it
					</DropdownMenu.Item>
					<DropdownMenu.Separator class="my-1 h-px bg-border" />
					<DropdownMenu.Item class={itemClass} onSelect={() => ask('create')}>
						Replace with a new link…
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item class="{itemClass} text-destructive" onSelect={() => ask('revoke')}>
					Withdraw link…
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<Modal
	bind:open={confirmOpen}
	title={confirming === 'create' ? 'Replace the customer link?' : 'Withdraw the customer link?'}
	dismissible={!working}
>
	{#snippet children()}
		<p class="text-sm">
			{#if confirming === 'create'}
				The current link stops working. Whoever has it needs the new one.
			{:else}
				The link stops working for everyone who has it.
			{/if}
		</p>
	{/snippet}
	{#snippet footer()}
		<Button
			variant={confirming === 'revoke' ? 'destructive' : 'default'}
			disabled={working}
			onclick={() => confirming && run(confirming)}
		>
			{confirming === 'create' ? 'New link' : 'Withdraw'}
		</Button>
		<Button variant="outline" disabled={working} onclick={() => (confirmOpen = false)}
			>Cancel</Button
		>
	{/snippet}
</Modal>
