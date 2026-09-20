<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { currentVersion, formatReleaseDate, notesFor, releases } from '$lib/changelog';

	let locale = $derived(page.data.locale ?? 'de');
</script>

<svelte:head><title>What's new | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">What's new</h1>
		<p class="text-muted-foreground">
			Everything that changed in Technikpool. You are running version {currentVersion}.
		</p>
	</div>

	{#each releases as release (release.version)}
		<Card.Root>
			<Card.Header>
				<Card.Title>Version {release.version}</Card.Title>
				<Card.Description>{formatReleaseDate(release, locale)}</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="space-y-2">
					{#each notesFor(release, locale) as note, i (i)}
						<li class="flex gap-2 text-sm">
							<span aria-hidden="true" class="text-muted-foreground">&bull;</span>
							<span>{note}</span>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/each}

	<p class="text-xs text-muted-foreground">The scanner app keeps its own list, under Settings.</p>
</div>
