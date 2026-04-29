<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { createProduction } from '$lib/remote/productions.remote';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';

	let saving = $state(false);
	let name = $state('');
	let organizationId = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let address = $state({
		line1: '',
		line2: '',
		postalCode: '',
		city: '',
		region: '',
		country: ''
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			const production = await createProduction({
				name,
				organizationId,
				startDate: startDate ? new Date(startDate) : undefined,
				endDate: endDate ? new Date(endDate) : undefined,
				address
			});
			toast.success('Production created!');
			goto(resolve(`/productions/${production.id}`));
		} catch (err) {
			toast.error((err as Error).message);
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
				{((organizationId = orgs[0].id), '')}
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
						class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
						required
					>
						{#each orgs as org (org.id)}
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

				<div class="space-y-2">
					<h2 class="text-base font-semibold">Address</h2>
					<p class="text-sm text-muted-foreground">Optional delivery / venue address.</p>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2 sm:col-span-2">
						<Label for="line1">Address line 1</Label>
						<Input id="line1" bind:value={address.line1} placeholder="Street and number" />
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="line2">Address line 2</Label>
						<Input id="line2" bind:value={address.line2} placeholder="Building, floor, c/o" />
					</div>
					<div class="space-y-2">
						<Label for="postal">Postal code</Label>
						<Input id="postal" bind:value={address.postalCode} placeholder="12345" />
					</div>
					<div class="space-y-2">
						<Label for="city">City</Label>
						<Input id="city" bind:value={address.city} placeholder="Berlin" />
					</div>
					<div class="space-y-2">
						<Label for="region">Region/State</Label>
						<Input id="region" bind:value={address.region} placeholder="BE" />
					</div>
					<div class="space-y-2">
						<Label for="country">Country</Label>
						<Input id="country" bind:value={address.country} placeholder="DE" />
					</div>
				</div>

				<div class="flex justify-end gap-4 pt-4">
					<Button type="button" variant="outline" href={resolve('/productions')}>Cancel</Button>
					<Button type="submit" disabled={saving}>
						{saving ? 'Creating...' : 'Create Production'}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
