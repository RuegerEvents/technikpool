<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import {
		getRentalTerms,
		saveRentalTerms,
		setRentalTermsEnabled
	} from '#lib/remote/rental-terms.remote.js';
	import { confirmAction } from '#lib/confirm.svelte.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';

	// The org's rental terms (Miet-AGB). Every save is a new version that
	// documents link to, so editing happens in a dialog with an explicit Save,
	// never field by field (src/lib/server/services/rental-terms.ts).

	let { orgId }: { orgId: string } = $props();

	let termsQuery = $derived(getRentalTerms(orgId));
	let terms = $derived(termsQuery.current);
	let active = $derived(terms?.versions.find((v) => v.id === terms?.activeVersionId) ?? null);

	let working = $state(false);
	let editing = $state(false);
	let draft = $state('');

	const day = (value: Date | string) => new Date(value).toLocaleDateString();

	async function run(action: () => Promise<unknown>, success: string) {
		working = true;
		try {
			await action();
			toast.success(success);
			return true;
		} catch (err) {
			toast.error(getErrorMessage(err));
			return false;
		} finally {
			working = false;
		}
	}

	function startEditing() {
		draft = terms?.source ?? '';
		editing = true;
	}

	async function save() {
		if (
			await run(
				() => saveRentalTerms({ organizationId: orgId, source: draft }),
				'Rental terms saved'
			)
		)
			editing = false;
	}

	async function switchOn() {
		await run(
			() => setRentalTermsEnabled({ organizationId: orgId, enabled: true }),
			'Rental terms switched on'
		);
	}

	async function switchOff() {
		const ok = await confirmAction({
			title: 'Switch off the rental terms?',
			description:
				'New offers, invoices and delivery notes no longer mention them, and borrowing organizations are no longer asked to agree. Documents already sent keep their link, and switching on again brings back the last version.',
			confirmLabel: 'Switch off',
			destructive: true
		});
		if (!ok) return;
		await run(
			() => setRentalTermsEnabled({ organizationId: orgId, enabled: false }),
			'Rental terms switched off'
		);
	}

	async function resetToTemplate() {
		const ok = await confirmAction({
			title: 'Replace the text with the template?',
			description:
				'The editor is filled with the current template. Nothing is saved until you press Save.',
			confirmLabel: 'Replace'
		});
		if (ok && terms) draft = terms.defaultSource;
	}
</script>

<Card.Root id="rental-terms" class="scroll-mt-20">
	<Card.Header>
		<Card.Title>Rental terms</Card.Title>
		<Card.Description>
			Your terms for renting out equipment. Attached to every offer, cited on invoices and delivery
			notes, and agreed to by organizations that borrow from you.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if !termsQuery.ready}
			<ContentSkeleton shape="rows" count={2} error={termsQuery.error} />
		{:else if terms && !terms.enabled}
			<div class="space-y-3 text-sm">
				<p class="text-muted-foreground">
					{#if terms.versions.length > 0}
						Switched off. Switching on brings back your last version.
					{:else}
						Not set up. Switching on starts from a template written for renting out event equipment,
						which you can then adapt.
					{/if}
				</p>
				<Button size="sm" class="w-full" disabled={working} onclick={switchOn}>Switch on</Button>
			</div>
		{:else if terms && active}
			<div class="space-y-3 text-sm">
				<p>
					In force since {day(active.createdAt)}.
					<a
						href={resolve(`rental-terms/${terms.orgSlug}/${active.number}`)}
						target="_blank"
						rel="noopener"
						class="underline underline-offset-2">Public page</a
					>
				</p>
				{#if terms.outdated}
					<p
						class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
					>
						Your name, address or payment term changed since this version was saved. Save the terms
						again to put the current details in.
					</p>
				{/if}
				{#if !terms.closingCites.offer || !terms.closingCites.invoice}
					<p
						class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
					>
						{#if !terms.closingCites.offer && !terms.closingCites.invoice}
							Your closing texts for offers and invoices don't mention the rental terms.
						{:else if !terms.closingCites.offer}
							Your closing text for offers doesn't mention the rental terms.
						{:else}
							Your closing text for invoices doesn't mention the rental terms.
						{/if}
						Add a sentence with {'{rentalTermsDate}'} and {'{rentalTermsUrl}'} under
						<a href={resolve(`orgs/${orgId}`) + '#billing'} class="underline underline-offset-2"
							>Billing Details</a
						>. The offer is where the terms become part of the contract.
					</p>
				{/if}
				<div class="flex gap-2">
					<Button icon="edit" variant="outline" size="sm" class="flex-1" onclick={startEditing}
						>Edit</Button
					>
					<Button variant="outline" size="sm" disabled={working} onclick={switchOff}
						>Switch off</Button
					>
				</div>
				{#if terms.versions.length > 1}
					<details class="text-muted-foreground">
						<summary class="cursor-pointer">Earlier versions ({terms.versions.length - 1})</summary>
						<ul class="mt-2 space-y-1">
							{#each terms.versions.filter((v) => v.id !== active?.id) as version (version.id)}
								<li>
									<a
										href={resolve(`rental-terms/${terms.orgSlug}/${version.number}`)}
										target="_blank"
										rel="noopener"
										class="underline underline-offset-2">{day(version.createdAt)}</a
									>
									{#if version.createdBy}· {version.createdBy}{/if}
								</li>
							{/each}
						</ul>
					</details>
				{/if}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<Modal bind:open={editing} title="Edit rental terms" size="xl" dismissible={!working}>
	{#snippet children()}
		<div class="space-y-3">
			<p class="text-sm text-muted-foreground">
				Markdown. {'{org}'}, {'{orgAddress}'} and {'{paymentTermsDays}'} are filled in with your organization's
				details when you save. Saving makes a new version: documents already sent keep linking the version
				they were sent with.
			</p>
			<textarea
				bind:value={draft}
				rows="24"
				spellcheck="true"
				lang="de"
				class="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"></textarea>
		</div>
	{/snippet}
	{#snippet footer()}
		<Button icon="save" disabled={working || !draft.trim()} onclick={save}>
			{working ? 'Saving…' : 'Save'}
		</Button>
		<Button variant="outline" disabled={working} onclick={() => (editing = false)}>Cancel</Button>
		<Button variant="ghost" class="sm:mr-auto" disabled={working} onclick={resetToTemplate}
			>Use template</Button
		>
	{/snippet}
</Modal>
