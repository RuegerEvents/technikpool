<script lang="ts">
	import { page } from '$app/state';

	// The second row inside a tab: Equipment's settings, locations and value,
	// Billing's details and price lists. Routes, like the tabs above.

	let { tabs }: { tabs: { href: string; label: string }[] } = $props();
</script>

{#if tabs.length > 1}
	<nav aria-label="Section">
		<ul class="flex flex-wrap gap-1.5">
			{#each tabs as tab (tab.href)}
				{@const current = page.url.pathname === tab.href}
				<li>
					<a
						href={tab.href}
						aria-current={current ? 'page' : undefined}
						class="block rounded-full border px-3 py-1 text-sm transition-colors {current
							? 'border-foreground bg-foreground text-background'
							: 'text-muted-foreground hover:text-foreground'}">{tab.label}</a
					>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
