<script lang="ts">
	import { cn } from '$lib/utils';

	type Org = { id: string; name: string };

	type Props = {
		orgs: Org[];
		value: string[];
		onchange: (next: string[]) => void;
		disabled?: boolean;
		id?: string;
		class?: string;
	};

	let { orgs, value, onchange, disabled = false, id, class: className }: Props = $props();

	let open = $state(false);
	let rootEl: HTMLDivElement;

	let summary = $derived(
		value.length === 0
			? 'No organizations'
			: value.length === orgs.length
				? 'All organizations'
				: value.length === 1
					? (orgs.find((o) => o.id === value[0])?.name ?? '1 organization')
					: `${value.length} organizations`
	);

	function toggle() {
		if (disabled) return;
		open = !open;
	}

	function toggleOrg(orgId: string) {
		onchange(value.includes(orgId) ? value.filter((id) => id !== orgId) : [...value, orgId]);
	}

	function selectAll() {
		onchange(orgs.map((o) => o.id));
	}

	function selectNone() {
		onchange([]);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	$effect(() => {
		if (!open) return;

		function onDocMouseDown(e: MouseEvent) {
			if (!rootEl?.contains(e.target as Node)) open = false;
		}

		document.addEventListener('mousedown', onDocMouseDown);
		return () => document.removeEventListener('mousedown', onDocMouseDown);
	});
</script>

<div bind:this={rootEl} class={cn('relative', className)}>
	<button
		type="button"
		{id}
		{disabled}
		onclick={toggle}
		onkeydown={handleKeydown}
		class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<span class="truncate">{summary}</span>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="ml-2 shrink-0 text-muted-foreground"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</button>

	{#if open && !disabled}
		<div
			class="absolute z-50 mt-1 w-56 overflow-hidden rounded-md border bg-background p-1 shadow-sm"
			role="listbox"
		>
			<div class="flex items-center justify-between gap-2 border-b px-2 py-1.5">
				<button
					type="button"
					onclick={selectAll}
					class="text-xs text-muted-foreground hover:text-foreground">Select all</button
				>
				<button
					type="button"
					onclick={selectNone}
					class="text-xs text-muted-foreground hover:text-foreground">Select none</button
				>
			</div>
			<div class="max-h-64 overflow-y-auto">
				{#each orgs as org (org.id)}
					<label
						class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60"
					>
						<input
							type="checkbox"
							checked={value.includes(org.id)}
							onchange={() => toggleOrg(org.id)}
							class="h-4 w-4 rounded border"
						/>
						{org.name}
					</label>
				{/each}
			</div>
		</div>
	{/if}
</div>
