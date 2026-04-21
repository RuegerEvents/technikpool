<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { createProduction } from '$lib/remote/productions.remote';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let saving = $state(false);
	let name = $state('');
	let organizationId = $state('');
	let startDate = $state('');
	let endDate = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			const production = await createProduction({
				name,
				organizationId,
				startDate: startDate ? new Date(startDate) : undefined,
				endDate: endDate ? new Date(endDate) : undefined
			});
			toast.success('Production created!');
			goto(`/productions/${production.id}`);
		} catch (err: any) {
			toast.error(err.message);
			saving = false;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Create Production</h1>
		<p class="text-muted-foreground">Start a new project or event to book equipment.</p>
	</div>

	<Card.Root class="max-w-2xl">
		<Card.Content class="pt-6">
			{@const orgs = await getMyOrgs()}
			{#if !organizationId && orgs[0]}
				{(organizationId = orgs[0].id, '')}
			{/if}
			<form onsubmit={handleSubmit} class="space-y-6">
					<div class="space-y-2">
						<Label for="name">Production Name</Label>
						<Input id="name" bind:value={name} placeholder="e.g. Summer Festival 2026" required />
					</div>

					<div class="space-y-2">
						<Label for="org">Owning Organization</Label>
						<select
							id="org"
							bind:value={organizationId}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
							required
						>
							{#each orgs as org}
								<option value={org.id}>{org.name}</option>
							{/each}
						</select>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<Label for="startDate">Start Date</Label>
							<Input id="startDate" type="date" bind:value={startDate} required />
						</div>
						<div class="space-y-2">
							<Label for="endDate">End Date</Label>
							<Input id="endDate" type="date" bind:value={endDate} required />
						</div>
					</div>

					<div class="pt-4 flex justify-end gap-4">
						<Button type="button" variant="outline" href="/productions">Cancel</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Creating...' : 'Create Production'}
						</Button>
					</div>
				</form>
		</Card.Content>
	</Card.Root>
</div>
