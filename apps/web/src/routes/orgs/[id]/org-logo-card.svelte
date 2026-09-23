<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getErrorMessage } from '$lib/utils';
	import { imageSrc } from '$lib/images';
	import { getOrgWithMembers } from '$lib/remote/orgs.remote';
	import { toast } from 'svelte-sonner';

	// Its own card rather than a field of the billing form: the file is uploaded
	// the moment it is picked, so there is nothing for Save or Cancel to decide.
	// No cropping either, unlike product photos: a logo is wide, and the server
	// trims whatever margin the file came with.

	let { orgId, logoPath }: { orgId: string; logoPath: string | null } = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let working = $state(false);

	async function send(init: RequestInit) {
		working = true;
		try {
			const response = await fetch(`/api/orgs/${orgId}/logo`, init);
			// The endpoint answers with an appError body, so the code translates here
			// like a remote function's would.
			if (!response.ok)
				throw { body: await response.json().catch(() => ({ message: 'Upload failed' })) };
			await getOrgWithMembers(orgId).refresh();
			return true;
		} catch (err) {
			toast.error(getErrorMessage(err));
			return false;
		} finally {
			working = false;
		}
	}

	async function handlePick() {
		const file = fileInput?.files?.[0];
		if (!file) return;
		const form = new FormData();
		form.append('file', file);
		if (await send({ method: 'POST', body: form })) toast.success('Logo uploaded');
		if (fileInput) fileInput.value = '';
	}

	async function handleRemove() {
		if (await send({ method: 'DELETE' })) toast.success('Logo removed');
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Logo</Card.Title>
		<Card.Description>Printed at the top of offers, invoices and delivery notes.</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-3">
		{#if logoPath}
			<!-- White whatever the theme: this is how it looks on paper. -->
			<div class="flex h-24 items-center justify-center rounded-md border bg-white p-3">
				<img src={imageSrc(logoPath)} alt="Organization logo" class="max-h-full max-w-full" />
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				No logo yet. PNG, JPEG, WebP or SVG — a transparent background works best.
			</p>
		{/if}
		<input
			bind:this={fileInput}
			type="file"
			accept="image/png,image/jpeg,image/webp,image/svg+xml"
			class="hidden"
			onchange={handlePick}
		/>
		<div class="flex gap-2">
			<Button
				icon="upload"
				variant="outline"
				size="sm"
				class="flex-1"
				disabled={working}
				onclick={() => fileInput?.click()}
			>
				{working ? 'Uploading…' : logoPath ? 'Replace' : 'Upload logo'}
			</Button>
			{#if logoPath}
				<Button icon="delete" variant="outline" size="sm" disabled={working} onclick={handleRemove}>
					Remove
				</Button>
			{/if}
		</div>
		<p class="text-xs text-muted-foreground">
			Drafts keep the logo they were created with until you use "Use current details" on them.
			Finalized documents never change.
		</p>
	</Card.Content>
</Card.Root>
