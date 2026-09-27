<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { legalTitle, type LegalSlug } from '$lib/legal.svelte';
	import { saveLegalDocument } from '$lib/remote/legal.remote';
	import { messageForErrorCode } from '$lib/error-messages.svelte';
	import { getErrorMessage } from '$lib/utils';

	let {
		doc
	}: {
		doc: { slug: LegalSlug; externalUrl: string; body: string };
	} = $props();

	// Writable deriveds: they follow the server's copy after a save and take
	// whatever is typed in between.
	let externalUrl = $derived(doc.externalUrl);
	let body = $derived(doc.body);
	let saving = $state(false);

	let dirty = $derived(externalUrl !== doc.externalUrl || body !== doc.body);
	let urlInvalid = $derived(!!externalUrl.trim() && !/^https?:\/\/\S+$/i.test(externalUrl.trim()));
	// The agreement is text only: an acceptance records the text it accepted.
	let isDpa = $derived(doc.slug === 'dpa');
	let usesUrl = $derived(!isDpa && !!externalUrl.trim());
	// The templates in docs/legal mark what the operator fills in as [Like this].
	// One left in a text that is shown to everyone — or that organizations sign —
	// is worth a word before saving. A Markdown link, [text](url), is not one.
	// Nor is a task-list box, [ ] / [x].
	let placeholders = $derived(
		[...body.matchAll(/\[([^\]\n]{1,60})\](?!\()/g)]
			.filter((m) => m[1].trim().length > 1)
			.map((m) => m[0])
	);
	let configured = $derived(!!doc.externalUrl.trim() || !!doc.body.trim());

	async function save(e: Event) {
		e.preventDefault();
		if (saving || urlInvalid) return;
		saving = true;
		try {
			await saveLegalDocument({ slug: doc.slug, externalUrl, body });
			toast.success(`${legalTitle(doc.slug)} saved`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}

	const textareaClass =
		'w-full rounded-md border bg-background px-3 py-2 font-mono text-sm disabled:opacity-50';
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{legalTitle(doc.slug)}</Card.Title>
		<Card.Description>
			{#if isDpa}
				{#if configured}
					Every organization's owner is asked to accept it. Changing the text asks them all again.
				{:else}
					Not set up — nobody is asked to accept one.
				{/if}
			{:else if !configured}
				Not set up — linked nowhere.
			{:else if doc.externalUrl.trim()}
				Links to your own page.
			{:else}
				Shown at
				<a href={resolve(`/legal/${doc.slug}`)} target="_blank" class="underline"
					>/legal/{doc.slug}</a
				>.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={save} class="space-y-4">
			<div class="space-y-2" hidden={isDpa}>
				<Label for="{doc.slug}-url">Link to your own page</Label>
				<Input
					id="{doc.slug}-url"
					type="url"
					bind:value={externalUrl}
					placeholder="https://example.com/{doc.slug}"
				/>
				{#if urlInvalid}
					<p class="text-sm text-destructive">{messageForErrorCode('legal_url_invalid')}</p>
				{:else}
					<p class="text-xs text-muted-foreground">
						If set, this is used and the text below is ignored.
					</p>
				{/if}
			</div>
			<div class="space-y-2">
				<Label for="{doc.slug}-body">Text (Markdown)</Label>
				<textarea
					id="{doc.slug}-body"
					bind:value={body}
					disabled={usesUrl}
					rows="16"
					class={textareaClass}></textarea>
				{#if placeholders.length > 0}
					<p class="text-sm text-amber-600">
						Still contains placeholders from the template: {placeholders.slice(0, 5).join(', ')}
					</p>
				{/if}
				<p class="text-xs text-muted-foreground">
					One text for every reader, in the language you write it in. Headings, lists, tables and
					links work; HTML and images are shown as plain text.
				</p>
			</div>
			<Button type="submit" disabled={saving || !dirty || urlInvalid}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</form>
	</Card.Content>
</Card.Root>
