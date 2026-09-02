<script lang="ts" module>
	export type ConnectorDraft = {
		name: string;
		/** What it mates with. Blank means a family of one. */
		family: string;
		/** Stecker or Buchse — the part that goes in, or the part that receives. */
		form: '' | 'plug' | 'socket';
		/** What the contacts are. Comes apart from `form` on locking connectors. */
		gender: '' | 'male' | 'female';
		/** The department a cable ending in this connector belongs to. '' = unstated. */
		categoryId: string;
		imagePath: string;
	};

	export function emptyConnectorDraft(name = ''): ConnectorDraft {
		return { name, family: '', form: '', gender: '', categoryId: '', imagePath: '' };
	}
</script>

<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ImageUpload } from '$lib/components/ui/image-upload';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { getCategories } from '$lib/remote/assets.remote';

	type Props = {
		value?: ConnectorDraft;
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
	};

	let { value = $bindable(emptyConnectorDraft()), idPrefix = 'connector' }: Props = $props();

	let categories = $derived(await getCategories());
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<Label for="{idPrefix}-name">Connector name</Label>
		<Input id="{idPrefix}-name" bind:value={value.name} placeholder="Schuko M" required />
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<div class="space-y-2">
			<Label for="{idPrefix}-family">Mates with</Label>
			<Input
				id="{idPrefix}-family"
				bind:value={value.family}
				placeholder={value.name || 'Schuko'}
			/>
			<p class="text-xs text-muted-foreground">
				The other half of the pair, named as a group: Schuko M and Schuko F are both
				<span class="font-medium">Schuko</span>. Leave it blank for a connector that only ever meets
				its own kind.
			</p>
		</div>

		<div class="space-y-2">
			<Label for="{idPrefix}-form">Body style</Label>
			<select
				id="{idPrefix}-form"
				bind:value={value.form}
				class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			>
				<option value="">Not stated</option>
				<option value="plug">Plug — on a cable</option>
				<option value="socket">Built-in socket — in a device</option>
			</select>
			<p class="text-xs text-muted-foreground">
				Where it sits, not what it mates with. Nearly every connector here is a plug, because nearly
				every one is a cable end — what it can be joined to is decided by the contacts beside it.
			</p>
		</div>

		<div class="space-y-2">
			<Label for="{idPrefix}-gender">Contacts</Label>
			<select
				id="{idPrefix}-gender"
				bind:value={value.gender}
				class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			>
				<option value="">Not stated</option>
				<option value="male">Pins (male)</option>
				<option value="female">Sockets (female)</option>
			</select>
			<p class="text-xs text-muted-foreground">
				This is the one that decides what mates with what: male meets female, inside the same
				family.
			</p>
		</div>
	</div>

	<div class="space-y-2">
		<Label for="{idPrefix}-category">Department</Label>
		<CategorySelect
			id="{idPrefix}-category"
			{categories}
			bind:value={value.categoryId}
			allowEmpty
			allLabel="Not stated"
		/>
		<p class="text-xs text-muted-foreground">
			Prefills the category on a new cable that ends in this connector — a Schuko plug is Power
			wherever it turns up. Only a starting point; the cable's own category still decides what it
			bills as.
		</p>
	</div>

	<div class="space-y-2">
		<Label>Connector image</Label>
		<ImageUpload bind:value={value.imagePath} label="Connector photo" />
	</div>
</div>
