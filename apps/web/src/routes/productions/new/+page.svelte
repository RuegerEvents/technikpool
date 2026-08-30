<script lang="ts">
	import { customerLabel, getErrorMessage, orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { AddressInput } from '$lib/components/ui/address-input';
	import { CustomerFields, emptyCustomerDraft } from '$lib/components/ui/customer-fields';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { createProduction } from '$lib/remote/productions.remote';
	import { getCustomers, createCustomer } from '$lib/remote/customers.remote';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';

	let saving = $state(false);
	let name = $state('');
	let organizationId = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let sameAsTotalDuration = $state(true);
	let showStartDate = $state('');
	let showEndDate = $state('');
	let address = $state({
		line1: '',
		line2: '',
		postalCode: '',
		city: ''
	});

	let customers = $derived(organizationId ? await getCustomers(organizationId) : []);
	let customerId = $state('');
	let creatingCustomer = $state(false);
	let newCustomer = $state(emptyCustomerDraft());

	async function handleSubmit(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			let finalCustomerId = customerId || undefined;
			if (creatingCustomer) {
				const created = await createCustomer({
					organizationId,
					companyName: newCustomer.companyName || undefined,
					contactPerson: newCustomer.contactPerson || undefined,
					email: newCustomer.email || undefined,
					address: newCustomer.address
				});
				finalCustomerId = created.id;
			}
			const production = await createProduction({
				name,
				organizationId,
				startDate: startDate ? new Date(startDate) : undefined,
				endDate: endDate ? new Date(endDate) : undefined,
				showStartDate: !sameAsTotalDuration && showStartDate ? new Date(showStartDate) : undefined,
				showEndDate: !sameAsTotalDuration && showEndDate ? new Date(showEndDate) : undefined,
				address,
				customerId: finalCustomerId
			});
			toast.success('Production created!');
			goto(resolve(`/productions/${production.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			saving = false;
		}
	}
</script>

<svelte:head><title>Create Production | Technikpool</title></svelte:head>

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
							<option value={org.id}>{orgLabel(org)}</option>
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
						<Input id="endDate" type="date" bind:value={endDate} min={startDate} required />
					</div>
				</div>

				<div class="space-y-3">
					<div>
						<h2 class="text-base font-semibold">Show Duration</h2>
						<p class="text-sm text-muted-foreground">
							The billable show days, used for offer/invoice day count. Must fall within the total
							duration above.
						</p>
					</div>
					<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
						<input
							type="checkbox"
							bind:checked={sameAsTotalDuration}
							class="h-4 w-4 rounded border-input"
						/>
						Same as total duration
					</label>
					{#if !sameAsTotalDuration}
						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="showStartDate">Show Start Date</Label>
								<Input
									id="showStartDate"
									type="date"
									bind:value={showStartDate}
									min={startDate}
									max={endDate}
								/>
							</div>
							<div class="space-y-2">
								<Label for="showEndDate">Show End Date</Label>
								<Input
									id="showEndDate"
									type="date"
									bind:value={showEndDate}
									min={showStartDate || startDate}
									max={endDate}
								/>
							</div>
						</div>
					{/if}
				</div>

				<div class="space-y-2">
					<h2 class="text-base font-semibold">Address</h2>
					<p class="text-sm text-muted-foreground">Optional delivery / venue address.</p>
				</div>

				<AddressInput bind:value={address} idPrefix="addr" />

				<div class="space-y-3">
					<div>
						<h2 class="text-base font-semibold">Customer</h2>
						<p class="text-sm text-muted-foreground">
							Optional — reused to auto-populate offers/invoices for this production.
						</p>
					</div>

					{#if !creatingCustomer}
						<div class="space-y-2">
							<select
								id="customer"
								bind:value={customerId}
								class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
							>
								<option value="">— None —</option>
								{#each customers as c (c.id)}
									<option value={c.id}>{customerLabel(c)}</option>
								{/each}
							</select>
							<Button
								type="button"
								variant="outline"
								onclick={() => {
									creatingCustomer = true;
									customerId = '';
								}}
							>
								+ New customer
							</Button>
						</div>
					{:else}
						<div class="space-y-4">
							<CustomerFields bind:value={newCustomer} idPrefix="prod-cust" />
							<Button type="button" variant="outline" onclick={() => (creatingCustomer = false)}>
								Cancel new customer
							</Button>
						</div>
					{/if}
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
