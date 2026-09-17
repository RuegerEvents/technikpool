<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { listGeneratedPreviews, regenerateGeneratedPreview } from '$lib/remote/assets.remote';
	import { toast } from 'svelte-sonner';

	let previewsQuery = $derived(listGeneratedPreviews());
	let previews = $derived(previewsQuery.current ?? []);

	let running = $state(false);
	let done = $state(0);
	let total = $state(0);
	let failed = $state(0);

	let percent = $derived(total > 0 ? Math.round((done / total) * 100) : 0);

	// One request per preview, sequentially. Each one reads every product photo
	// in the bundle out of the object store and re-encodes it, so firing them all
	// at once would queue hundreds of round trips against a store that is also
	// serving the app. Sequential is slower and keeps the instance usable, which
	// is the right trade for a maintenance job nobody is waiting on.
	async function regenerateAll() {
		if (running) return;
		const targets = previews;
		running = true;
		done = 0;
		failed = 0;
		total = targets.length;
		for (const target of targets) {
			try {
				await regenerateGeneratedPreview(target);
			} catch (err) {
				// One unreadable photo must not end the run — the count is reported
				// at the end and the server log has the reason.
				console.error(`Could not regenerate preview for ${target.kind} ${target.id}:`, err);
				failed++;
			}
			done++;
		}
		running = false;
		if (failed > 0)
			toast.error(`${done - failed} of ${total} previews regenerated, ${failed} failed`);
		else toast.success(`${total} previews regenerated`);
	}
</script>

<svelte:head><title>Maintenance | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Maintenance</h1>
		<p class="text-muted-foreground">Instance-wide jobs for system admins.</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Bundle previews</Card.Title>
			<Card.Description>
				The collage shown for every bundle and for every unit that has accessories. These are
				redrawn automatically when a bundle's contents change — run this after the way they are
				drawn has changed, to redraw all {previews.length} of them now.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if running || done > 0}
				<div class="space-y-1.5">
					<div class="flex items-baseline justify-between text-sm">
						<span class="text-muted-foreground">
							{running ? 'Regenerating…' : 'Finished'}
							{#if failed > 0}
								· {failed} failed
							{/if}
						</span>
						<span class="tabular-nums">{done} / {total}</span>
					</div>
					<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
						<div class="h-full bg-primary transition-[width]" style="width: {percent}%"></div>
					</div>
				</div>
			{/if}
			<Button disabled={running || previews.length === 0} onclick={regenerateAll}>
				{running ? 'Regenerating…' : 'Regenerate all previews'}
			</Button>
			<p class="text-xs text-muted-foreground">
				Reload a page showing bundles afterwards — an already-loaded list keeps the addresses it was
				given until then.
			</p>
		</Card.Content>
	</Card.Root>
</div>
