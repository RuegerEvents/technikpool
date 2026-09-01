<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { ImageUpload } from '$lib/components/ui/image-upload';

	export type ProductDraft = {
		name: string;
		categoryId: string;
		imagePath: string;
		/**
		 * Number inputs bind as numbers and use undefined for an empty field.
		 * Prices are per-org: whichever org the surrounding form is acting for
		 * is whose price this is.
		 */
		netPurchasePrice: number | undefined;
	};

	type Props = {
		value?: ProductDraft;
		categories: { id: string; name: string; color: string }[];
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
		/** Hide the price field where the page renders its own per-org price inputs. */
		showPrice?: boolean;
		/**
		 * Grey out name and category when the server would refuse to change them
		 * — a product whose units belong to an org the user doesn't admin.
		 */
		identityDisabled?: boolean;
	};

	let {
		value = $bindable({ name: '', categoryId: '', imagePath: '', netPurchasePrice: undefined }),
		categories,
		idPrefix = 'product',
		showPrice = true,
		identityDisabled = false
	}: Props = $props();
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<Label for="{idPrefix}-name">Product Name</Label>
		<Input id="{idPrefix}-name" bind:value={value.name} required disabled={identityDisabled} />
	</div>

	<div class="space-y-2">
		<Label for="{idPrefix}-category">Category</Label>
		<CategorySelect
			id="{idPrefix}-category"
			{categories}
			bind:value={value.categoryId}
			placeholder="Select a category"
			disabled={identityDisabled}
		/>
	</div>

	{#if showPrice}
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
				What your organization's rental rate is calculated from. It applies to every unit of this
				product your organization bills — other organizations set their own price.
			</p>
		</div>
	{/if}

	<div class="space-y-2">
		<Label>Product Image</Label>
		<ImageUpload bind:value={value.imagePath} label="Product photo" />
	</div>
</div>
