<script lang="ts">
	// A product's PDFs — manuals, datasheets — to open, and where the caller may,
	// to add, rename and remove. Used on the product's page and, read-only, in
	// the product card of a unit's page. The files are public by construction
	// (see src/lib/server/services/product-documents.ts), and the upload says so
	// before anyone picks a file.
	import { FileText, Info, Pencil, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { imageSrc } from '$lib/images';
	import { getErrorMessage } from '$lib/utils';
	import {
		addProductDocument,
		getProductDocuments,
		removeProductDocument,
		updateProductDocument
	} from '$lib/remote/product-documents.remote';

	type Kind = 'MANUAL' | 'DATASHEET' | 'OTHER';

	let { productId, editable = true }: { productId: string; editable?: boolean } = $props();

	let documentsQuery = $derived(getProductDocuments(productId));
	let documents = $derived(documentsQuery.current?.documents ?? []);
	let canAdd = $derived(editable && (documentsQuery.current?.canAdd ?? false));

	function kindLabel(kind: Kind) {
		switch (kind) {
			case 'MANUAL':
				return 'Manual';
			case 'DATASHEET':
				return 'Datasheet';
			case 'OTHER':
				return 'Other';
		}
	}

	function size(bytes: number) {
		return bytes < 1024 * 1024
			? `${Math.max(1, Math.round(bytes / 1024))} KB`
			: `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
	}

	// ── Adding ──────────────────────────────────────────────────────────────
	let file = $state<File | null>(null);
	let title = $state('');
	let kind = $state<Kind>('MANUAL');
	let uploading = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	function pick(e: Event) {
		const chosen = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		file = chosen;
		// The file's own name is usually the best first guess at a title.
		if (chosen) {
			title = chosen.name
				.replace(/\.pdf$/i, '')
				.replace(/[_-]+/g, ' ')
				.trim();
			if (/data.?sheet|datenblatt/i.test(chosen.name)) kind = 'DATASHEET';
		}
	}

	function reset() {
		file = null;
		title = '';
		kind = 'MANUAL';
		if (fileInput) fileInput.value = '';
	}

	async function upload(e: Event) {
		e.preventDefault();
		if (!file || !title.trim()) return;
		uploading = true;
		try {
			const body = new FormData();
			body.append('file', file);
			const response = await fetch('/api/uploads/document', { method: 'POST', body });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message ?? 'Upload failed');
			await addProductDocument({
				productId,
				path: result.path,
				sizeBytes: result.sizeBytes,
				title: title.trim(),
				kind
			});
			toast.success('PDF added');
			reset();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			uploading = false;
		}
	}

	// ── Changing ────────────────────────────────────────────────────────────
	let editingId = $state<string | null>(null);
	let editTitle = $state('');
	let editKind = $state<Kind>('OTHER');
	let confirmingId = $state<string | null>(null);
	let working = $state(false);

	function startEdit(document: { id: string; title: string; kind: Kind }) {
		editingId = document.id;
		editTitle = document.title;
		editKind = document.kind;
		confirmingId = null;
	}

	async function saveEdit(e: Event) {
		e.preventDefault();
		if (!editingId || !editTitle.trim()) return;
		working = true;
		try {
			await updateProductDocument({
				documentId: editingId,
				title: editTitle.trim(),
				kind: editKind
			});
			editingId = null;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	async function remove(documentId: string) {
		working = true;
		try {
			await removeProductDocument(documentId);
			confirmingId = null;
			toast.success('PDF removed');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	const selectClass =
		'h-9 rounded-md border border-input bg-background px-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none';
</script>

<div class="space-y-3" class:hidden={!editable && documents.length === 0}>
	<!-- Read-only, a product without PDFs says nothing at all: the card it sits
	     in is about the product, and "no PDFs" is not news there. -->
	{#if !documentsQuery.ready}
		{#if editable}
			<ContentSkeleton shape="rows" count={2} error={documentsQuery.error} />
		{/if}
	{:else if documents.length === 0}
		{#if editable}
			<p class="text-sm text-muted-foreground">No PDFs yet.</p>
		{/if}
	{:else}
		<ul class="divide-y rounded-md border">
			{#each documents as document (document.id)}
				<li class="px-3 py-2">
					{#if editingId === document.id}
						<form class="flex flex-wrap items-center gap-2" onsubmit={saveEdit}>
							<Input class="h-9 min-w-40 flex-1" bind:value={editTitle} disabled={working} />
							<select class={selectClass} bind:value={editKind} disabled={working}>
								<option value="MANUAL">Manual</option>
								<option value="DATASHEET">Datasheet</option>
								<option value="OTHER">Other</option>
							</select>
							<Button type="submit" size="sm" disabled={working || !editTitle.trim()}>Save</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={working}
								onclick={() => (editingId = null)}>Cancel</Button
							>
						</form>
					{:else}
						<div class="flex items-center gap-3">
							<FileText class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={imageSrc(document.path)}
								target="_blank"
								rel="noopener"
								class="min-w-0 flex-1 truncate text-sm font-medium underline-offset-2 hover:underline"
							>
								{document.title}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
							<span class="shrink-0 text-xs text-muted-foreground">
								{kindLabel(document.kind)} · {size(document.sizeBytes)}
							</span>
							{#if editable && document.canChange}
								{#if confirmingId === document.id}
									<Button
										size="sm"
										variant="destructive"
										disabled={working}
										onclick={() => remove(document.id)}>Remove</Button
									>
									<Button
										size="sm"
										variant="outline"
										disabled={working}
										onclick={() => (confirmingId = null)}>Keep</Button
									>
								{:else}
									<button
										type="button"
										title="Rename"
										class="text-muted-foreground hover:text-foreground"
										onclick={() => startEdit(document)}
									>
										<Pencil class="size-4" />
									</button>
									<button
										type="button"
										title="Remove"
										class="text-muted-foreground hover:text-destructive"
										onclick={() => (confirmingId = document.id)}
									>
										<Trash2 class="size-4" />
									</button>
								{/if}
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if canAdd}
		<form class="space-y-2 rounded-md border border-dashed p-3" onsubmit={upload}>
			<p class="flex items-start gap-2 text-xs text-muted-foreground">
				<Info class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
				<span>
					PDFs are public: every organization, and anyone with the link, can open them. Upload
					manuals and datasheets only — nothing private or internal.
				</span>
			</p>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/pdf,.pdf"
				onchange={pick}
				disabled={uploading}
				class="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
			/>
			{#if file}
				<div class="flex flex-wrap items-center gap-2">
					<Input
						class="h-9 min-w-40 flex-1"
						bind:value={title}
						placeholder="Title"
						disabled={uploading}
					/>
					<select class={selectClass} bind:value={kind} disabled={uploading}>
						<option value="MANUAL">Manual</option>
						<option value="DATASHEET">Datasheet</option>
						<option value="OTHER">Other</option>
					</select>
					<Button type="submit" size="sm" icon="add" disabled={uploading || !title.trim()}>
						{uploading ? 'Uploading…' : 'Add PDF'}
					</Button>
				</div>
			{/if}
		</form>
	{/if}
</div>
