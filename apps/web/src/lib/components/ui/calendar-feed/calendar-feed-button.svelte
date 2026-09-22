<script lang="ts">
	import { CalendarPlus, Copy, RotateCcw } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { getCalendarFeedUrl, resetCalendarFeedUrl } from '$lib/remote/calendar-feed.remote';

	let open = $state(false);
	let confirmingReset = $state(false);
	let resetting = $state(false);

	// Only fetched once the dialog opens — the link is a credential, and the
	// pages hosting this button have no other use for it.
	let feedUrlQuery = $derived(open ? getCalendarFeedUrl() : null);
	let url = $derived(feedUrlQuery?.current ?? null);
	// webcal:// hands the feed to the OS calendar app as a subscription; Google
	// Calendar's "From URL" field wants the plain https link instead.
	let webcalUrl = $derived(url?.replace(/^https?:/, 'webcal:') ?? null);

	async function copy() {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			toast.success('Link copied');
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	async function reset() {
		resetting = true;
		try {
			await resetCalendarFeedUrl();
			confirmingReset = false;
			toast.success('New link created. The old one no longer works.');
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			resetting = false;
		}
	}
</script>

<button
	type="button"
	onclick={() => (open = true)}
	class="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm hover:bg-muted"
>
	<CalendarPlus class="size-4" aria-hidden="true" />
	Subscribe
</button>

<Modal
	bind:open
	title="Subscribe to productions"
	size="lg"
	onclose={() => (confirmingReset = false)}
>
	{#snippet description()}
		Shows every production of your organizations in Google Calendar, Apple Calendar or Outlook. Your
		calendar app refreshes it on its own schedule, which can take a few hours.
	{/snippet}

	{#if url}
		<div class="space-y-4">
			<div class="flex gap-2">
				<input
					readonly
					value={url}
					onfocus={(e) => e.currentTarget.select()}
					aria-label="Calendar link"
					class="h-9 min-w-0 flex-1 rounded-md border border-input bg-muted/30 px-3 font-mono text-xs"
				/>
				<Button variant="outline" onclick={copy}>
					<Copy aria-hidden="true" />
					Copy
				</Button>
			</div>
			<p class="text-sm text-muted-foreground">
				Anyone with this link can see the names, dates and locations of your productions. If it was
				shared by mistake, reset it: the old link stops working immediately, and existing
				subscriptions have to be set up again with the new one.
			</p>
		</div>
	{/if}

	{#snippet footer()}
		{#if confirmingReset}
			<Button variant="ghost" onclick={() => (confirmingReset = false)}>Cancel</Button>
			<Button variant="destructive" onclick={reset} disabled={resetting}>
				<RotateCcw aria-hidden="true" />
				Reset link
			</Button>
		{:else}
			<Button variant="ghost" onclick={() => (confirmingReset = true)}>Reset link…</Button>
			{#if webcalUrl}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<Button href={webcalUrl}>
					<CalendarPlus aria-hidden="true" />
					Open in calendar app
				</Button>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		{/if}
	{/snippet}
</Modal>
