<script lang="ts">
	import { categoryLabel } from '$lib/category';
	import { getErrorMessage, plural } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import {
		copyEquipmentFromProduction,
		getEquipmentCopyPlan,
		getEquipmentCopySources
	} from '$lib/remote/equipment.remote';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		productionId,
		organizationId,
		open = $bindable(false)
	}: { productionId: string; organizationId: string; open: boolean } = $props();

	let sourceId = $state('');
	let copying = $state(false);
	// Everything that can be booked starts ticked, so the set holds what was
	// unticked rather than what was ticked — a fresh plan needs no effect to
	// fill it in, and switching the source only has to clear it.
	const unticked = new SvelteSet<string>();

	let sourcesQuery = $derived(open ? getEquipmentCopySources(productionId) : null);
	let sources = $derived(sourcesQuery?.current ?? []);
	let planQuery = $derived(
		open && sourceId ? getEquipmentCopyPlan({ sourceId, targetId: productionId }) : null
	);
	let lines = $derived(planQuery?.current ?? []);
	type Line = (typeof lines)[number];

	let categories = $derived.by(() => {
		const groups: { id: string; name: string; color: string; lines: Line[] }[] = [];
		for (const line of lines) {
			let group = groups.find((g) => g.id === line.categoryId);
			if (!group) {
				group = {
					id: line.categoryId,
					name: categoryLabel({ name: line.categoryName, nameDe: line.categoryNameDe }),
					color: line.categoryColor,
					lines: []
				};
				groups.push(group);
			}
			group.lines.push(line);
		}
		return groups;
	});

	// Lines from more than one org are the exception, so the badge only shows then.
	let mixedOrgs = $derived(
		new Set(lines.map((line) => line.organizationId)).size > 1 ||
			lines.some((line) => line.organizationId !== organizationId)
	);

	const selectable = (line: Line) => line.available > 0;
	const isTicked = (line: Line) => selectable(line) && !unticked.has(line.key);
	let chosen = $derived(lines.filter(isTicked));

	function toggle(line: Line) {
		if (unticked.has(line.key)) unticked.delete(line.key);
		else unticked.add(line.key);
	}

	function toggleAll(group: Line[], tick: boolean) {
		for (const line of group.filter(selectable)) {
			if (tick) unticked.delete(line.key);
			else unticked.add(line.key);
		}
	}

	function formatDate(value: Date | string | null) {
		return value ? new Date(value).toLocaleDateString() : '';
	}

	function sourceLabel(source: (typeof sources)[number]) {
		const dates = source.startDate
			? ` · ${formatDate(source.startDate)} – ${formatDate(source.endDate)}`
			: '';
		return `${source.name}${dates} · ${source.organizationName}`;
	}

	function statusOf(line: Line): { text: string; tone: 'ok' | 'warn' | 'none' | 'muted' } {
		const need = line.quantity - line.alreadyHere;
		if (need <= 0) return { text: 'Already booked here', tone: 'muted' };
		if (line.available === 0) return { text: 'Not available', tone: 'none' };
		const parts: string[] = [];
		if (line.available < need) parts.push(`${line.available} of ${need} available`);
		else parts.push('Available');
		if (line.alreadyHere > 0) parts.push(`${line.alreadyHere} already here`);
		if (line.incomplete > 0)
			parts.push(plural(line.incomplete, ['# kit incomplete', '# kits incomplete']));
		return {
			text: parts.join(' · '),
			tone: line.available < need || line.incomplete > 0 ? 'warn' : 'ok'
		};
	}

	function close() {
		open = false;
		sourceId = '';
		unticked.clear();
	}

	async function handleCopy() {
		if (!sourceId || chosen.length === 0) return;
		copying = true;
		try {
			const result = await copyEquipmentFromProduction({
				sourceId,
				targetId: productionId,
				keys: chosen.map((line) => line.key)
			});
			const parts = [plural(result.booked, ['# device booked', '# devices booked'])];
			if (result.short > 0)
				parts.push(plural(result.short, ['# not available', '# not available']));
			if (result.short > 0) toast.warning(parts.join(' · '));
			else toast.success(parts.join(' · '));
			close();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			copying = false;
		}
	}
</script>

<Modal
	bind:open
	title="Copy equipment from another production"
	size="full"
	dismissible={!copying}
	onclose={close}
>
	{#snippet children()}
		<div class="space-y-4">
			<div class="space-y-1.5">
				<label for="copy-equipment-source" class="text-sm font-medium">Source production</label>
				<select
					id="copy-equipment-source"
					bind:value={sourceId}
					onchange={() => unticked.clear()}
					disabled={copying || !sourcesQuery?.ready}
					class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
				>
					<option value="" disabled>
						{sourcesQuery?.ready ? 'Choose a production…' : 'Loading…'}
					</option>
					{#each sources as source (source.id)}
						<option value={source.id}>{sourceLabel(source)}</option>
					{/each}
				</select>
				{#if sourcesQuery?.ready && sources.length === 0}
					<p class="text-sm text-muted-foreground">No other production has equipment booked.</p>
				{/if}
			</div>

			{#if planQuery}
				{#if !planQuery.ready}
					<ContentSkeleton shape="rows" count={6} error={planQuery.error} />
				{:else if lines.length === 0}
					<p class="py-6 text-center text-sm text-muted-foreground">
						This production has no equipment booked.
					</p>
				{:else}
					<p class="text-sm text-muted-foreground">
						Units are booked by product: the source's own units where they are free on this
						production's dates, otherwise other free units of the same product. What is already
						booked here counts towards each line.
					</p>
					<div class="divide-y rounded-md border">
						{#each categories as group (group.id)}
							{@const pickable = group.lines.filter(selectable)}
							{@const allTicked = pickable.length > 0 && pickable.every(isTicked)}
							<div>
								<label
									class="flex items-center gap-2 bg-muted/40 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
								>
									<input
										type="checkbox"
										checked={allTicked}
										indeterminate={!allTicked && pickable.some(isTicked)}
										disabled={pickable.length === 0 || copying}
										onchange={() => toggleAll(group.lines, !allTicked)}
										class="h-4 w-4 rounded border-input"
									/>
									<span class="h-2 w-2 rounded-full" style="background-color: {group.color}"></span>
									{group.name}
								</label>
								{#each group.lines as line (line.key)}
									{@const status = statusOf(line)}
									<label
										class="flex items-center gap-3 border-t px-3 py-2 text-sm {selectable(line)
											? 'cursor-pointer hover:bg-muted/30'
											: 'opacity-60'}"
									>
										<input
											type="checkbox"
											checked={isTicked(line)}
											disabled={!selectable(line) || copying}
											onchange={() => toggle(line)}
											class="h-4 w-4 shrink-0 rounded border-input"
										/>
										<ProductThumb path={line.imagePath} alt={line.name} size={40} />
										<div class="min-w-0 flex-1">
											<div class="truncate font-medium">
												{line.name}
												{#if line.kind === 'bundle'}
													<span
														class="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase"
														>Kit</span
													>
												{/if}
											</div>
											<div class="truncate text-xs text-muted-foreground">
												{#if line.manufacturerName}{line.manufacturerName}{/if}
												{#if line.manufacturerName && line.tags.length > 0}
													·
												{/if}
												{#if line.tags.length > 0}{line.tags.join(', ')}{/if}
											</div>
											{#if mixedOrgs}
												<OrgBadge
													name={line.organizationName}
													color={line.organizationColor}
													avatarLabel={line.organizationAvatarLabel}
													class="mt-0.5 text-xs text-muted-foreground"
												/>
											{/if}
										</div>
										<div class="shrink-0 text-right">
											<div class="font-semibold tabular-nums">{line.quantity}×</div>
											<div
												class="text-xs {status.tone === 'ok'
													? 'text-green-700 dark:text-green-400'
													: status.tone === 'warn'
														? 'text-orange-600 dark:text-orange-400'
														: status.tone === 'none'
															? 'text-red-600 dark:text-red-400'
															: 'text-muted-foreground'}"
											>
												{status.text}
											</div>
										</div>
									</label>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<Button disabled={copying || chosen.length === 0} onclick={handleCopy}>
			{copying
				? 'Copying…'
				: chosen.length > 0
					? plural(chosen.length, ['Book # item', 'Book # items'])
					: 'Book items'}
		</Button>
		<Button variant="outline" disabled={copying} onclick={close}>Cancel</Button>
	{/snippet}
</Modal>
