<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { getErrorMessage } from '$lib/utils';
	import { revealLicenseCredentials } from '$lib/remote/licenses.remote';
	import type { LicenseCredentials } from '$lib/license';

	type Props = {
		open: boolean;
		/** The license to reveal. Opening the dialog *is* the request — and the audit entry. */
		assetId: string | null;
		title: string;
	};

	let { open = $bindable(false), assetId, title }: Props = $props();

	// How long revealed credentials stay on screen. Long enough to type a key
	// into an installer; short enough that a laptop left open on a FOH desk
	// isn't showing it to the room all evening.
	const REVEAL_SECONDS = 60;

	let revealed = $state<LicenseCredentials | null>(null);
	let secondsLeft = $state(0);

	// Asked for once per opening. A refused reveal says why in a toast and
	// closes again, rather than leaving an empty dialog behind.
	$effect(() => {
		if (!open || !assetId) return;
		const id = assetId;
		untrack(async () => {
			try {
				const credentials = await revealLicenseCredentials(id);
				if (!open || assetId !== id) return;
				revealed = credentials;
				secondsLeft = REVEAL_SECONDS;
			} catch (err) {
				toast.error(getErrorMessage(err));
				open = false;
			}
		});
		return () => {
			revealed = null;
			secondsLeft = 0;
		};
	});

	$effect(() => {
		if (!revealed) return;
		const timer = setInterval(() => {
			secondsLeft -= 1;
			if (secondsLeft <= 0) open = false;
		}, 1000);
		return () => clearInterval(timer);
	});

	async function copy(value: string | null) {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			toast.success('Copied to clipboard');
		} catch {
			toast.error('Could not copy — select the text instead');
		}
	}

	let fields = $derived.by(() => {
		if (!revealed) return [];
		const rows =
			revealed.kind === 'key'
				? [{ key: 'licenseKey', label: 'License key', value: revealed.licenseKey }]
				: [
						{ key: 'username', label: 'Username', value: revealed.username },
						{ key: 'password', label: 'Password', value: revealed.password }
					];
		return rows.filter((row) => !!row.value);
	});
</script>

<Modal bind:open {title} size="md">
	{#snippet children()}
		{#if !revealed}
			<p class="text-sm text-muted-foreground">Opening…</p>
		{:else}
			<div class="space-y-4">
				{#each fields as field (field.key)}
					<div class="space-y-1">
						<p class="text-xs font-medium text-muted-foreground">{field.label}</p>
						<div class="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
							<code class="min-w-0 flex-1 font-mono text-base break-all select-all"
								>{field.value}</code
							>
							<Button icon="copy" size="sm" variant="outline" onclick={() => copy(field.value)}
								>Copy</Button
							>
						</div>
					</div>
				{/each}
				{#if revealed.note}
					<div class="space-y-1">
						<p class="text-xs font-medium text-muted-foreground">Note</p>
						<p class="text-sm whitespace-pre-wrap">{revealed.note}</p>
					</div>
				{/if}
				<p class="text-xs text-muted-foreground">
					Closes itself in {secondsLeft} s. Viewing is recorded in the audit log.
				</p>
			</div>
		{/if}
	{/snippet}
	{#snippet footer()}
		<Button icon="close" type="button" variant="outline" onclick={() => (open = false)}
			>Close</Button
		>
	{/snippet}
</Modal>
