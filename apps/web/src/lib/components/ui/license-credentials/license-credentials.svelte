<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Modal } from '$lib/components/ui/modal';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { getErrorMessage } from '$lib/utils';
	import {
		clearLicenseCredentials,
		getLicenseStatus,
		setLicenseCredentials
	} from '$lib/remote/licenses.remote';
	import type { LicenseCredentialKind } from '$lib/license';
	import LicenseRevealModal from './license-reveal-modal.svelte';

	type Props = {
		assetId: string;
		/** Off where the page already says who has the license. */
		showHolders?: boolean;
	};

	let { assetId, showHolders = true }: Props = $props();

	// Read, not awaited: this sits in pages that must not wait for it. See
	// CLAUDE.md, "Loading States".
	let statusQuery = $derived(getLicenseStatus(assetId));
	let status = $derived(statusQuery.current);

	// The credentials themselves only ever appear in a dialog of their own —
	// see LicenseRevealModal.
	let revealOpen = $state(false);

	// ── Edit ─────────────────────────────────────────────────────────────────
	// Write-only: the form starts empty and never shows what is stored, so
	// replacing a key does not need the old one on screen first.
	let editOpen = $state(false);
	let saving = $state(false);
	let draft = $state({
		kind: 'key' as LicenseCredentialKind,
		licenseKey: '',
		username: '',
		password: '',
		note: ''
	});

	function openEdit() {
		draft = {
			kind: status?.storedKind ?? 'key',
			licenseKey: '',
			username: '',
			password: '',
			note: ''
		};
		editOpen = true;
	}

	async function save(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			await setLicenseCredentials({
				assetId,
				kind: draft.kind,
				licenseKey: draft.kind === 'key' ? draft.licenseKey : null,
				username: draft.kind === 'login' ? draft.username : null,
				password: draft.kind === 'login' ? draft.password : null,
				note: draft.note
			});
			revealOpen = false;
			editOpen = false;
			toast.success('Credentials saved');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}

	let confirmingRemove = $state(false);
	let removing = $state(false);

	async function remove() {
		removing = true;
		try {
			await clearLicenseCredentials(assetId);
			revealOpen = false;
			confirmingRemove = false;
			toast.success('Credentials removed');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			removing = false;
		}
	}

	function formatDate(date: Date | null) {
		return date ? new Date(date).toLocaleDateString('de-DE') : null;
	}
</script>

{#if !status}
	<ContentSkeleton shape="rows" count={2} error={statusQuery.error} />
{:else}
	<div class="space-y-4">
		{#if showHolders}
			<div class="space-y-1">
				<p class="text-xs font-medium text-muted-foreground">Currently with</p>
				{#if status.holders.length === 0}
					<p class="text-sm">Nobody — not checked out to a production.</p>
				{:else}
					{#each status.holders as holder, i (i)}
						<p class="text-sm">
							{#if holder.productionId}
								<a
									href={resolve(`/productions/${holder.productionId}`)}
									class="font-medium underline underline-offset-2">{holder.productionName}</a
								>
							{:else}
								<span class="font-medium">{holder.productionName}</span>
							{/if}
							{#if holder.since}
								<span class="text-muted-foreground">· since {formatDate(holder.since)}</span>
							{/if}
							{#if holder.checkedOutBy}
								<span class="text-muted-foreground">· checked out by {holder.checkedOutBy}</span>
							{/if}
						</p>
					{/each}
				{/if}
			</div>
		{/if}

		{#if status.storedKind}
			<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
				<div class="text-sm">
					<p class="font-medium">
						{status.storedKind === 'key' ? 'License key stored' : 'Login stored'}
					</p>
					<p class="text-xs text-muted-foreground">
						{#if status.canReveal}
							Hidden until you ask for it. Viewing is recorded in the audit log.
						{:else}
							Only shown to whoever has this license checked out to their production, and to the
							organization that keeps it.
						{/if}
					</p>
				</div>
				{#if status.canReveal}
					<Button size="sm" onclick={() => (revealOpen = true)}>Show credentials</Button>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No credentials stored for this license yet.</p>
		{/if}

		{#if status.canEdit}
			<div class="flex flex-wrap gap-2">
				<Button icon="edit" size="sm" variant="outline" onclick={openEdit}>
					{status.storedKind ? 'Replace credentials' : 'Add credentials'}
				</Button>
				{#if status.storedKind}
					<Button
						icon="delete"
						size="sm"
						variant="outline"
						class="border-destructive/40 text-destructive hover:bg-destructive/10"
						onclick={() => (confirmingRemove = true)}>Remove</Button
					>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<LicenseRevealModal bind:open={revealOpen} {assetId} title="License credentials" />

<Modal bind:open={editOpen} title="License credentials" dismissible={!saving}>
	{#snippet children()}
		<form id="license-credentials-form-{assetId}" class="space-y-4" onsubmit={save}>
			<div class="flex overflow-hidden rounded-md border border-input text-sm">
				<button
					type="button"
					onclick={() => (draft.kind = 'key')}
					class="flex-1 px-3 py-1.5 transition-colors {draft.kind === 'key'
						? 'bg-primary text-primary-foreground'
						: 'bg-background hover:bg-muted'}">License key</button
				>
				<button
					type="button"
					onclick={() => (draft.kind = 'login')}
					class="flex-1 px-3 py-1.5 transition-colors {draft.kind === 'login'
						? 'bg-primary text-primary-foreground'
						: 'bg-background hover:bg-muted'}">Username & password</button
				>
			</div>
			{#if draft.kind === 'key'}
				<div class="space-y-2">
					<Label for="license-key-{assetId}">License key</Label>
					<Input
						id="license-key-{assetId}"
						bind:value={draft.licenseKey}
						autocomplete="off"
						class="font-mono"
					/>
				</div>
			{:else}
				<div class="space-y-2">
					<Label for="license-username-{assetId}">Username</Label>
					<Input id="license-username-{assetId}" bind:value={draft.username} autocomplete="off" />
				</div>
				<div class="space-y-2">
					<Label for="license-password-{assetId}">Password</Label>
					<Input
						id="license-password-{assetId}"
						type="password"
						bind:value={draft.password}
						autocomplete="new-password"
					/>
				</div>
			{/if}
			<div class="space-y-2">
				<Label for="license-note-{assetId}">Note</Label>
				<Input
					id="license-note-{assetId}"
					bind:value={draft.note}
					placeholder="Registered email, activations left…"
					autocomplete="off"
				/>
				<p class="text-xs text-muted-foreground">Stored encrypted with the credentials.</p>
			</div>
			{#if status?.storedKind}
				<p class="text-xs text-muted-foreground">
					This replaces what is stored. The current credentials are not shown here.
				</p>
			{/if}
		</form>
	{/snippet}
	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (editOpen = false)}
			disabled={saving}
		>
			Cancel
		</Button>
		<Button icon="save" type="submit" form="license-credentials-form-{assetId}" disabled={saving}>
			{saving ? 'Saving…' : 'Save'}
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={confirmingRemove} title="Remove credentials?" dismissible={!removing}>
	{#snippet children()}
		<p class="text-sm text-muted-foreground">
			The stored key or login is deleted and cannot be recovered. The license itself stays.
		</p>
	{/snippet}
	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (confirmingRemove = false)}
			disabled={removing}
		>
			Cancel
		</Button>
		<Button
			type="button"
			class="bg-destructive text-white hover:bg-destructive/90"
			onclick={remove}
			disabled={removing}
		>
			{removing ? 'Removing…' : 'Remove credentials'}
		</Button>
	{/snippet}
</Modal>
