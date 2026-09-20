<script lang="ts">
	// The one question the data model cannot answer for anybody: a case of lamps
	// and a lamp with its brackets both look like "several things that travel
	// together", and the app models them as two entirely different arrangements.
	// Getting it wrong is expensive later — a bundle cannot be made into a
	// parent, and pulling a parent's accessories apart undoes every booking they
	// were carried into — so it is worth one dialog to say which is which.
	//
	// Reached from both places the distinction is made: the bundle list and the
	// accessories card on a unit.
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { Boxes, Layers } from '@lucide/svelte';

	let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<Modal bind:open title="Bundle or accessory?" size="lg">
	<div class="space-y-5 text-sm">
		<p class="text-muted-foreground">
			Both put several units together, and they are not interchangeable. The question that separates
			them is whether the parts belong to one particular device, or whether the case is the thing
			being kept.
		</p>

		<!-- Accessories first: it is the narrower idea and the one a bundle's
		     description refers back to, so reading them the other way round means
		     meeting "so that cable is an accessory" before knowing what one is. -->
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2 rounded-md border p-4">
				<div class="flex items-center gap-2 font-semibold">
					<Layers class="h-4 w-4 text-muted-foreground" />
					Device with accessories
				</div>
				<p class="text-muted-foreground">
					Accessories that always come with the device and are not rented out separately. For
					example a power supply, a connecting cable, a case or a bag.
				</p>
				<ul class="ml-4 list-disc space-y-1 text-muted-foreground">
					<li>Attached to exactly one unit, one level deep</li>
					<li>Booked, moved, scanned and returned with that unit automatically</li>
					<li>Never separately bookable — asking for the device asks for them</li>
					<li>Follows its device into a bundle, if the device is in one</li>
				</ul>
			</div>

			<div class="space-y-2 rounded-md border p-4">
				<div class="flex items-center gap-2 font-semibold">
					<Boxes class="h-4 w-4 text-muted-foreground" />
					Bundle
				</div>
				<p class="text-muted-foreground">
					A set of devices that is physically packed together and usually rented that way (for
					example 4 fixtures in one shared case). A single fixture can still be rented on its own.
					Its connecting cable would come along anyway, so that cable is an accessory.
				</p>
				<ul class="ml-4 list-disc space-y-1 text-muted-foreground">
					<li>Has its own tag, location, price and photo</li>
					<li>Bills as a single line, without pricing every unit inside it</li>
					<li>Units go in and come out again; the case outlives any of them</li>
					<li>Can be copied to build the next identical case</li>
				</ul>
			</div>
		</div>

		<div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
			<p class="font-medium text-amber-900 dark:text-amber-200">Which one do I want?</p>
			<p class="mt-1 text-amber-800/90 dark:text-amber-300/90">
				Ask what happens when the case is emptied. If the parts then belong to nothing in particular
				and could be packed differently tomorrow, it is a bundle. If a part would still be that one
				device's power supply lying on the shelf, it is an accessory.
			</p>
		</div>

		<p class="text-muted-foreground">
			The two are not exclusive: a device inside a bundle can carry its own accessories, and they
			are pulled into the case along with it.
		</p>
	</div>

	{#snippet footer()}
		<Button type="button" variant="outline" onclick={() => (open = false)}>Close</Button>
	{/snippet}
</Modal>
