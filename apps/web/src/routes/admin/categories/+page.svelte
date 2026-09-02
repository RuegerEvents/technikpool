<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getCategories, updateCategory } from '$lib/remote/assets.remote';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	let categories = $derived(await getCategories());

	type Draft = {
		name: string;
		nameDe: string;
		color: string;
		sortOrder: string;
		cableInputGender: '' | 'male' | 'female';
	};
	let drafts = new SvelteMap<string, Draft>();
	let saving = new SvelteSet<string>();

	function draftFor(c: (typeof categories)[number]): Draft {
		return (
			drafts.get(c.id) ?? {
				name: c.name,
				nameDe: c.nameDe ?? '',
				color: c.color,
				sortOrder: String(c.sortOrder),
				cableInputGender: (c.cableInputGender as 'male' | 'female' | null) ?? ''
			}
		);
	}

	function edit(c: (typeof categories)[number], patch: Partial<Draft>) {
		drafts.set(c.id, { ...draftFor(c), ...patch });
	}

	async function handleSave(c: (typeof categories)[number]) {
		const draft = drafts.get(c.id);
		if (!draft) return;
		saving.add(c.id);
		try {
			await updateCategory({
				categoryId: c.id,
				name: draft.name,
				nameDe: draft.nameDe || null,
				color: draft.color,
				sortOrder: Number(draft.sortOrder),
				cableInputGender: draft.cableInputGender || null
			});
			drafts.delete(c.id);
			toast.success('Category saved');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving.delete(c.id);
		}
	}
</script>

<svelte:head><title>Categories | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Categories</h1>
		<p class="text-muted-foreground">
			Categories are shared by every organization. The English name is the source — it is what the
			API returns and what a billing line records; the German name is what the German UI and a
			German offer or invoice show.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="space-y-3 pt-6">
			{#each categories as category (category.id)}
				{@const draft = draftFor(category)}
				{@const dirty = drafts.has(category.id)}
				<div
					class="grid items-end gap-3 border-b pb-3 last:border-0 last:pb-0 sm:grid-cols-[auto_1fr_1fr_5rem_auto]"
				>
					<div class="space-y-1">
						<Label for="color-{category.id}" class="text-xs">Colour</Label>
						<input
							id="color-{category.id}"
							type="color"
							value={draft.color}
							oninput={(e) => edit(category, { color: (e.target as HTMLInputElement).value })}
							class="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
						/>
					</div>
					<div class="space-y-1">
						<Label for="name-{category.id}" class="text-xs">English name</Label>
						<Input
							id="name-{category.id}"
							value={draft.name}
							oninput={(e) => edit(category, { name: (e.target as HTMLInputElement).value })}
						/>
					</div>
					<div class="space-y-1">
						<Label for="nameDe-{category.id}" class="text-xs">German name</Label>
						<Input
							id="nameDe-{category.id}"
							value={draft.nameDe}
							placeholder={category.name}
							oninput={(e) => edit(category, { nameDe: (e.target as HTMLInputElement).value })}
						/>
					</div>
					<div class="space-y-1">
						<!-- Which end of a cable in this department feeds. It is a
						     power-versus-signal fact, not a per-connector one: a cable's male
						     end takes power in, while an XLR's female end is the receiving
						     one. Recording it here is what lets the cable forms say when the
						     two ends have been entered the wrong way round. -->
						<Label for="dir-{category.id}" class="text-xs">Cable input end</Label>
						<select
							id="dir-{category.id}"
							value={draft.cableInputGender}
							onchange={(e) =>
								edit(category, {
									cableInputGender: (e.currentTarget as HTMLSelectElement).value as
										'' | 'male' | 'female'
								})}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
						>
							<option value="">No direction</option>
							<option value="male">Male end feeds</option>
							<option value="female">Female end feeds</option>
						</select>
					</div>
					<div class="space-y-1">
						<Label for="sort-{category.id}" class="text-xs">Order</Label>
						<Input
							id="sort-{category.id}"
							type="number"
							value={draft.sortOrder}
							oninput={(e) => edit(category, { sortOrder: (e.target as HTMLInputElement).value })}
							class="text-right"
						/>
					</div>
					<Button
						icon="save"
						variant="outline"
						disabled={!dirty || saving.has(category.id)}
						onclick={() => handleSave(category)}
					>
						Save
					</Button>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
</div>
