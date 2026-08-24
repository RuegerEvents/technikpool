<script lang="ts">
	import { assetStatusClass, assetStatusLabel } from './asset-status.svelte';

	let { status, class: className = '' }: { status: string; class?: string } = $props();
</script>

<span
	class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {assetStatusClass(
		status
	)} {className}"
>
	{assetStatusLabel(status)}
</span>
