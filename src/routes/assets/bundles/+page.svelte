<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getBundles, createBundle } from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';

	let showForm = $state(false);
	let saving = $state(false);
	let name = $state('');
	let description = $state('');
	let selectedOrgId = $state('');

	async function handleCreate(e: Event) {
		e.preventDefault();
		if (!name.trim() || !selectedOrgId) return;
		saving = true;
		try {
			await createBundle({
				name: name.trim(),
				description: description.trim() || undefined,
				organizationId: selectedOrgId
			});
			toast.success('Bundle created!');
			name = '';
			description = '';
			showForm = false;
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			saving = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Asset Bundles</h1>
			<p class="text-muted-foreground">Grouped sets of equipment that can be booked together.</p>
		</div>
		<Button onclick={() => (showForm = !showForm)}>
			{showForm ? 'Cancel' : 'New Bundle'}
		</Button>
	</div>

	{#if showForm}
		{#if true}
			{@const orgs = await getMyOrgs()}
			{#if !selectedOrgId && orgs[0]}{((selectedOrgId = orgs[0].id), '')}{/if}
			<Card.Root class="max-w-lg">
				<Card.Content class="pt-6">
					<form onsubmit={handleCreate} class="space-y-4">
						<div class="space-y-2">
							<Label for="org">Organization</Label>
							<select
								id="org"
								bind:value={selectedOrgId}
								required
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
							>
								{#each orgs as org (org.id)}<option value={org.id}>{org.name}</option>{/each}
							</select>
						</div>
						<div class="space-y-2">
							<Label for="name">Bundle Name</Label>
							<Input id="name" bind:value={name} placeholder="e.g. Camera A Kit" required />
						</div>
						<div class="space-y-2">
							<Label for="desc">Description (optional)</Label>
							<Input id="desc" bind:value={description} placeholder="What's in this bundle?" />
						</div>
						<div class="flex justify-end gap-3">
							<Button type="button" variant="outline" onclick={() => (showForm = false)}
								>Cancel</Button
							>
							<Button type="submit" disabled={saving}
								>{saving ? 'Creating…' : 'Create Bundle'}</Button
							>
						</div>
					</form>
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}

	{#if true}
		{@const bundles = await getBundles()}
		{#if bundles.length === 0}
			<Card.Root>
				<Card.Content class="flex flex-col items-center justify-center py-12 text-center">
					<p class="text-lg font-medium">No bundles yet</p>
					<p class="text-sm text-muted-foreground">
						Create bundles to group equipment for easy booking.
					</p>
					<Button class="mt-4" variant="outline" onclick={() => (showForm = true)}
						>Create your first bundle</Button
					>
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each bundles as bundle (bundle.id)}
					<a href={resolve(`/assets/bundles/${bundle.id}`)} class="group block">
						<Card.Root class="h-full transition-colors hover:bg-muted/50">
							<Card.Header>
								<Card.Title>{bundle.name}</Card.Title>
								<Card.Description>{bundle.organization.name}</Card.Description>
							</Card.Header>
							<Card.Content>
								{#if bundle.description}
									<p class="mb-2 text-sm text-muted-foreground">{bundle.description}</p>
								{/if}
								<p class="text-sm">
									<span class="font-medium">{bundle.assets.length}</span>
									<span class="text-muted-foreground"
										>item{bundle.assets.length !== 1 ? 's' : ''}</span
									>
								</p>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
	{/if}
</div>
