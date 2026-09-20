<script lang="ts">
	// What to do with the PDF once it is downloaded: which product it was drawn
	// for, and the one thing the shop's order form cannot settle — the setup fee,
	// which is charged per page unless someone points out that every page carries
	// the same cut contour.
	//
	// The shop is named as an example and linked, not presented as the only way
	// to get these printed.
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';

	let { open = $bindable(false) }: { open: boolean } = $props();

	const PRODUCT_URL =
		'https://www.wir-machen-druck.de/stickerbogen-extrem-stark-haftend-40-farbig-bedruckt-mit-freier-groesse-rechteckig.html';
</script>

<Modal bind:open title="Ordering printed sheets" size="lg">
	<div class="space-y-4 text-sm">
		<div>
			<h3 class="font-semibold">Recommended product</h3>
			<p class="mt-1 text-muted-foreground">
				Stickerbogen extrem stark haftend, for example from <a
					href={PRODUCT_URL}
					target="_blank"
					rel="noreferrer"
					class="text-primary underline underline-offset-4">WIRmachenDRUCK.de</a
				>. The PDF fits it as it is.
			</p>
		</div>

		<div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
			<p class="font-medium text-amber-900 dark:text-amber-200">
				Tip: ask for it as a custom product
			</p>
			<p class="mt-1 text-amber-800/90 dark:text-amber-300/90">
				Ordered through the form, every page counts as a job of its own and the machine setup is
				charged for each one. All pages share the exact same cut contour, so ask by email before you
				order:
			</p>
			<p class="mt-2 text-amber-900 italic dark:text-amber-200">
				Please set this up as a custom product with a different design per page and an identical cut
				contour.
			</p>
		</div>
	</div>

	{#snippet footer()}
		<Button type="button" variant="outline" onclick={() => (open = false)}>Close</Button>
	{/snippet}
</Modal>
