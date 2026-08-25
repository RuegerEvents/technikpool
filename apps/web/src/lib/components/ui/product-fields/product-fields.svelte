<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { ImageUpload } from '$lib/components/ui/image-upload';

	export type ProductDraft = {
		name: string;
		categoryId: string;
		imageUrl: string;
	};

	type Props = {
		value?: ProductDraft;
		categories: { id: string; name: string; color: string }[];
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
	};

	let {
		value = $bindable({ name: '', categoryId: '', imageUrl: '' }),
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
		<Label>Product Image</Label>
		<ImageUpload bind:value={value.imageUrl} label="Product photo" />
	</div>
</div>
