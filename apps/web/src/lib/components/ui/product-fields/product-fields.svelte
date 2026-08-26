<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { ImageUpload } from '$lib/components/ui/image-upload';

	export type ProductDraft = {
		name: string;
		categoryId: string;
		imageUrl: string;
		/** Kept as a string so an empty field means "unknown", not 0. */
		netPurchasePrice: string;
	};

	type Props = {
		value?: ProductDraft;
		categories: { id: string; name: string; color: string }[];
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
	};

	let {
		value = $bindable({ name: '', categoryId: '', imageUrl: '', netPurchasePrice: '' }),
		categories,
		idPrefix = 'product'
	}: Props = $props();
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<Label for="{idPrefix}-name">Product Name</Label>
		<Input id="{idPrefix}-name" bind:value={value.name} required />
	</div>

	<div class="space-y-2">
		<Label for="{idPrefix}-category">Category</Label>
		<CategorySelect
			id="{idPrefix}-category"
			{categories}
			bind:value={value.categoryId}
			placeholder="Select a category"
		/>
	</div>

	<div class="space-y-2">
		<Label for="{idPrefix}-price">Net purchase price (€)</Label>
		<Input
			id="{idPrefix}-price"
			type="number"
			min="0"
			step="0.01"
			placeholder="Unknown"
			bind:value={value.netPurchasePrice}
		/>
		<p class="text-sm text-muted-foreground">
			What a rental rate is calculated from. It applies to every unit of this product.
		</p>
	</div>

	<div class="space-y-2">
		<Label>Product Image</Label>
		<ImageUpload bind:value={value.imageUrl} label="Product photo" />
	</div>
</div>
