<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { resolve } from '$app/paths';
	import type { BillingIssue, BillingIssueArea } from '$lib/billing-document-check.svelte';

	// What stops a document from becoming a PDF, listed where it can be fixed —
	// the PDF link itself is disabled while this shows, so it never leads to a
	// bare error response.
	let {
		issues,
		organizationId,
		editable
	}: {
		issues: BillingIssue[];
		organizationId: string;
		/** Whether the document still takes the org's current details. */
		editable: boolean;
	} = $props();

	const areas: { key: BillingIssueArea; title: string }[] = [
		{ key: 'organization', title: 'Organization' },
		{ key: 'customer', title: 'Customer' },
		{ key: 'document', title: 'Document' },
		{ key: 'lines', title: 'Line items' }
	];

	let billingHref = $derived(resolve(`/orgs/${organizationId}`) + '#billing');
	const linkClass = 'underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100';

	let groups = $derived(
		areas
			.map((area) => ({
				...area,
				labels: issues.filter((issue) => issue.area === area.key).map((issue) => issue.label)
			}))
			.filter((group) => group.labels.length > 0)
	);
</script>

{#if issues.length > 0}
	<Card.Root class="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
		<Card.Content class="space-y-3 py-4 text-sm">
			<div>
				<p class="font-medium text-amber-900 dark:text-amber-200">
					The PDF cannot be generated yet
				</p>
				<p class="text-amber-800/80 dark:text-amber-300/80">
					An offer or invoice has to carry all of this. Fill in what is missing and the PDF is
					available again.
				</p>
			</div>
			<dl class="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
				{#each groups as group (group.key)}
					<dt class="font-medium text-amber-900 dark:text-amber-200">{group.title}</dt>
					<dd class="text-amber-800 dark:text-amber-300">
						{group.labels.join(', ')}
						{#if group.key === 'organization'}
							<span class="block text-xs text-amber-800/80 dark:text-amber-300/80">
								<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved, plus a hash -->
								{#if editable}
									Fill them in under <a href={billingHref} class={linkClass}>billing details</a>,
									then take them onto this document with “Use current details”.
								{:else}
									Fill them in under <a href={billingHref} class={linkClass}>billing details</a>.
								{/if}
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							</span>
						{/if}
					</dd>
				{/each}
			</dl>
		</Card.Content>
	</Card.Root>
{/if}
