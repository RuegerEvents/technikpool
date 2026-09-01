<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		getOrgWithMembers,
		addUserToOrg,
		deleteOrg,
		removeUserFromOrg,
		updateMemberRole,
		updateOrg
	} from '$lib/remote/orgs.remote';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { Modal } from '$lib/components/ui/modal';
	import {
		DEFAULT_INVOICE_CLOSING,
		DEFAULT_INVOICE_INTRO,
		DEFAULT_OFFER_CLOSING,
		DEFAULT_OFFER_INTRO
	} from '$lib/billing-text';

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let org = $derived(await getOrgWithMembers(orgId));

	let myMembership = $derived(org.members.find((m) => m.userId === data.user?.id));
	let canManage = $derived(myMembership?.role === 'OWNER' || data.isAdmin);
	let deleteOpen = $state(false);
	let deleting = $state(false);

	async function handleDeleteOrg() {
		if (deleting) return;
		deleting = true;
		try {
			await deleteOrg(orgId);
			toast.success('Organization deleted');
			await goto(resolve('/orgs'));
		} catch (err) {
			toast.error(getErrorMessage(err));
			deleting = false;
		}
	}

	let addEmail = $state('');
	let addRole = $state<'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');
	let adding = $state(false);

	async function handleAddUser(e: Event) {
		e.preventDefault();
		if (!addEmail) return;
		try {
			adding = true;
			await addUserToOrg({ orgId, email: addEmail, role: addRole });
			toast.success(`${addEmail} added to organization`);
			addEmail = '';
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			adding = false;
		}
	}

	async function handleRemove(userId: string, name: string) {
		try {
			await removeUserFromOrg({ orgId, userId });
			toast.success(`${name} removed from organization`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function handleRoleChange(userId: string, role: string) {
		try {
			await updateMemberRole({
				orgId,
				userId,
				role: role as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
			});
			toast.success('Role updated');
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	let editingSettings = $state(false);
	let shortNameDraft = $state('');
	let prefixDraft = $state('');
	let colorDraft = $state('');
	let avatarLabelDraft = $state('');
	let inspectionIntervalDraft = $state('');
	let isKleinunternehmerDraft = $state(false);
	let savingSettings = $state(false);

	$effect(() => {
		if (!editingSettings) {
			shortNameDraft = org.shortName ?? '';
			prefixDraft = org.assetIdPrefix;
			colorDraft = org.color;
			avatarLabelDraft = org.avatarLabel;
			inspectionIntervalDraft = org.defaultInspectionIntervalMonths?.toString() ?? '';
			isKleinunternehmerDraft = org.isKleinunternehmer;
		}
	});

	async function handleSettingsSave(e: Event) {
		e.preventDefault();
		savingSettings = true;
		try {
			await updateOrg({
				orgId,
				shortName: shortNameDraft || null,
				assetIdPrefix: prefixDraft,
				color: colorDraft,
				avatarLabel: avatarLabelDraft,
				defaultInspectionIntervalMonths: inspectionIntervalDraft
					? Number(inspectionIntervalDraft)
					: null,
				isKleinunternehmer: isKleinunternehmerDraft
			});
			toast.success('Organization settings updated');
			editingSettings = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingSettings = false;
		}
	}

	let editingBilling = $state(false);
	let savingBilling = $state(false);
	let billingDraft = $state({
		line1: '',
		line2: '',
		postalCode: '',
		city: '',
		taxId: '',
		bankAccountHolder: '',
		iban: '',
		bic: '',
		bankName: '',
		billingEmail: '',
		billingWebsite: '',
		paymentTermsDays: '14',
		offerIntroTemplate: '',
		offerClosingTemplate: '',
		invoiceIntroTemplate: '',
		invoiceClosingTemplate: ''
	});

	$effect(() => {
		if (!editingBilling) {
			billingDraft = {
				line1: org.address?.line1 ?? '',
				line2: org.address?.line2 ?? '',
				postalCode: org.address?.postalCode ?? '',
				city: org.address?.city ?? '',
				taxId: org.taxId ?? '',
				bankAccountHolder: org.bankAccountHolder ?? '',
				iban: org.iban ?? '',
				bic: org.bic ?? '',
				bankName: org.bankName ?? '',
				billingEmail: org.billingEmail ?? '',
				billingWebsite: org.billingWebsite ?? '',
				paymentTermsDays: String(org.paymentTermsDays),
				offerIntroTemplate: org.offerIntroTemplate ?? DEFAULT_OFFER_INTRO,
				offerClosingTemplate: org.offerClosingTemplate ?? DEFAULT_OFFER_CLOSING,
				invoiceIntroTemplate: org.invoiceIntroTemplate ?? DEFAULT_INVOICE_INTRO,
				invoiceClosingTemplate: org.invoiceClosingTemplate ?? DEFAULT_INVOICE_CLOSING
			};
		}
	});

	async function handleBillingSave(e: Event) {
		e.preventDefault();
		savingBilling = true;
		try {
			const hasAddress = billingDraft.line1 || billingDraft.postalCode || billingDraft.city;
			await updateOrg({
				orgId,
				assetIdPrefix: org.assetIdPrefix,
				color: org.color,
				avatarLabel: org.avatarLabel,
				address: hasAddress
					? {
							line1: billingDraft.line1,
							line2: billingDraft.line2 || undefined,
							postalCode: billingDraft.postalCode,
							city: billingDraft.city
						}
					: null,
				taxId: billingDraft.taxId || null,
				bankAccountHolder: billingDraft.bankAccountHolder || null,
				iban: billingDraft.iban || null,
				bic: billingDraft.bic || null,
				bankName: billingDraft.bankName || null,
				billingEmail: billingDraft.billingEmail || null,
				billingWebsite: billingDraft.billingWebsite || null,
				paymentTermsDays: Number(billingDraft.paymentTermsDays) || 14,
				offerIntroTemplate: billingDraft.offerIntroTemplate || null,
				offerClosingTemplate: billingDraft.offerClosingTemplate || null,
				invoiceIntroTemplate: billingDraft.invoiceIntroTemplate || null,
				invoiceClosingTemplate: billingDraft.invoiceClosingTemplate || null
			});
			toast.success('Billing details updated');
			editingBilling = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingBilling = false;
		}
	}

	const roleLabels: Record<string, string> = {
		OWNER: 'Owner',
		ADMIN: 'Admin',
		MEMBER: 'Member',
		VIEWER: 'Viewer'
	};
</script>

<svelte:head><title>{org.name} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<Button
			variant="ghost"
			href={resolve('/orgs')}
			class="flex items-center gap-1 text-muted-foreground"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="m15 18-6-6 6-6" />
			</svg>
			Organizations
		</Button>
	</div>

	<div>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-3xl font-bold tracking-tight">{org.name}</h1>
				<p class="text-muted-foreground">Manage members and roles.</p>
			</div>
			{#if canManage}
				<div class="flex flex-wrap items-center gap-2">
					<Button variant="outline" href={resolve(`/orgs/${orgId}/locations`)}>Locations</Button>
					<Button variant="outline" href={resolve(`/orgs/${orgId}/rates`)}>Rental Rates</Button>
					<Button variant="destructive" onclick={() => (deleteOpen = true)}>Delete</Button>
				</div>
			{/if}
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		{#if canManage}
			<div class="space-y-6">
				<Card.Root>
					<Card.Header>
						<Card.Title>Organization Settings</Card.Title>
						<Card.Description>
							Asset ID prefix, visual identity, DGUV default interval, and Kleinunternehmer status.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						{#if editingSettings}
							<form onsubmit={handleSettingsSave} class="space-y-4">
								<div class="space-y-2">
									<Label for="shortNameInput"
										>Short name <span class="text-muted-foreground">(optional)</span></Label
									>
									<Input
										id="shortNameInput"
										bind:value={shortNameDraft}
										placeholder={org.name}
										maxlength={24}
									/>
									<p class="text-xs text-muted-foreground">
										Shown instead of the full name in tables and pickers. Invoices and offers always
										use the full name.
									</p>
								</div>
								<div class="space-y-2">
									<Label for="prefixInput">Asset ID prefix</Label>
									<Input
										id="prefixInput"
										bind:value={prefixDraft}
										placeholder="123"
										maxlength={3}
										required
										class="w-24"
									/>
								</div>
								<div class="flex gap-4">
									<div class="space-y-2">
										<Label for="colorInput">Color</Label>
										<div class="flex gap-2">
											<Input
												id="colorInput"
												type="color"
												bind:value={colorDraft}
												class="h-10 w-14 p-1"
											/>
											<Input bind:value={colorDraft} class="w-28 font-mono" required />
										</div>
									</div>
									<div class="space-y-2">
										<Label for="avatarLabelInput">Avatar label</Label>
										<Input
											id="avatarLabelInput"
											bind:value={avatarLabelDraft}
											maxlength={2}
											required
											class="w-20 font-mono uppercase"
										/>
									</div>
								</div>
								<div class="space-y-2">
									<Label for="inspectionIntervalInput"
										>Default DGUV inspection interval (months)</Label
									>
									<Input
										id="inspectionIntervalInput"
										type="number"
										min="1"
										bind:value={inspectionIntervalDraft}
										placeholder="e.g. 12"
										class="w-28"
									/>
									<p class="text-xs text-muted-foreground">
										Copied onto new assets at creation; leave blank to not track inspections by
										default.
									</p>
								</div>
								<label class="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										bind:checked={isKleinunternehmerDraft}
										class="h-4 w-4 rounded border-input"
									/>
									Kleinunternehmer (§19 UStG) — no VAT charged
								</label>
								<div class="flex gap-2">
									<Button icon="save" type="submit" disabled={savingSettings}>
										{savingSettings ? 'Saving…' : 'Save'}
									</Button>
									<Button
										icon="close"
										type="button"
										variant="outline"
										onclick={() => (editingSettings = false)}
									>
										Cancel
									</Button>
								</div>
							</form>
						{:else}
							<div class="space-y-3">
								<div class="flex items-center justify-between">
									<span class="text-sm text-muted-foreground">Short name</span>
									<span>{org.shortName || '—'}</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-sm text-muted-foreground">Asset ID prefix</span>
									<span class="font-mono">{org.assetIdPrefix}</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-sm text-muted-foreground">Visual identity</span>
									<OrgBadge name={orgLabel(org)} color={org.color} avatarLabel={org.avatarLabel} />
								</div>
								<div class="flex items-center justify-between">
									<span class="text-sm text-muted-foreground">DGUV default interval</span>
									<span>
										{org.defaultInspectionIntervalMonths
											? `${org.defaultInspectionIntervalMonths} months`
											: 'Not tracked'}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-sm text-muted-foreground">Kleinunternehmer</span>
									<span>{org.isKleinunternehmer ? 'Yes' : 'No'}</span>
								</div>
								<Button
									icon="edit"
									variant="outline"
									size="sm"
									class="w-full"
									onclick={() => (editingSettings = true)}
								>
									Edit
								</Button>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title>Billing Details</Card.Title>
						<Card.Description
							>Address, tax ID, and bank account — used on generated offers/invoices.</Card.Description
						>
					</Card.Header>
					<Card.Content>
						{#if editingBilling}
							<form onsubmit={handleBillingSave} class="space-y-4">
								<div class="space-y-2">
									<Label for="billingLine1">Address line 1</Label>
									<Input id="billingLine1" bind:value={billingDraft.line1} />
								</div>
								<div class="space-y-2">
									<Label for="billingLine2">Address line 2</Label>
									<Input id="billingLine2" bind:value={billingDraft.line2} placeholder="Optional" />
								</div>
								<div class="flex gap-4">
									<div class="space-y-2">
										<Label for="billingPostal">Postal code</Label>
										<Input id="billingPostal" bind:value={billingDraft.postalCode} class="w-28" />
									</div>
									<div class="flex-1 space-y-2">
										<Label for="billingCity">City</Label>
										<Input id="billingCity" bind:value={billingDraft.city} />
									</div>
								</div>
								<div class="space-y-2">
									<Label for="billingTaxId">Tax ID (Steuernummer / USt-IdNr.)</Label>
									<Input id="billingTaxId" bind:value={billingDraft.taxId} />
								</div>
								<div class="space-y-2">
									<Label for="billingHolder">Bank account holder</Label>
									<Input id="billingHolder" bind:value={billingDraft.bankAccountHolder} />
								</div>
								<div class="flex gap-4">
									<div class="flex-1 space-y-2">
										<Label for="billingIban">IBAN</Label>
										<Input id="billingIban" bind:value={billingDraft.iban} class="font-mono" />
									</div>
									<div class="space-y-2">
										<Label for="billingBic">BIC</Label>
										<Input id="billingBic" bind:value={billingDraft.bic} class="w-32 font-mono" />
									</div>
								</div>
								<div class="space-y-2">
									<Label for="billingBankName">Bank name</Label>
									<Input id="billingBankName" bind:value={billingDraft.bankName} />
								</div>
								<div class="grid gap-4 sm:grid-cols-2">
									<div class="space-y-2">
										<Label for="billingEmail">Billing email</Label><Input
											id="billingEmail"
											type="email"
											bind:value={billingDraft.billingEmail}
										/>
									</div>
									<div class="space-y-2">
										<Label for="billingWebsite">Website</Label><Input
											id="billingWebsite"
											bind:value={billingDraft.billingWebsite}
										/>
									</div>
									<div class="space-y-2">
										<Label for="paymentTerms">Payment term (days)</Label><Input
											id="paymentTerms"
											type="number"
											min="0"
											bind:value={billingDraft.paymentTermsDays}
										/>
									</div>
								</div>
								<div class="space-y-4 rounded-md border p-4">
									<div>
										<p class="font-medium">Document text presets</p>
										<p class="text-sm text-muted-foreground">
											Placeholders: {'{production}'}, {'{startDate}'}, {'{endDate}'}, {'{servicePeriod}'},
											{'{customer}'}, {'{documentNumber}'}, {'{paymentTermsDays}'}
										</p>
									</div>
									<div class="space-y-2">
										<Label for="offerIntro">Offer introduction</Label><textarea
											id="offerIntro"
											bind:value={billingDraft.offerIntroTemplate}
											rows="3"
											class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
									</div>
									<div class="space-y-2">
										<Label for="offerClosing">Offer closing</Label><textarea
											id="offerClosing"
											bind:value={billingDraft.offerClosingTemplate}
											rows="3"
											class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
									</div>
									<div class="space-y-2">
										<Label for="invoiceIntro">Invoice introduction</Label><textarea
											id="invoiceIntro"
											bind:value={billingDraft.invoiceIntroTemplate}
											rows="3"
											class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
									</div>
									<div class="space-y-2">
										<Label for="invoiceClosing">Invoice closing</Label><textarea
											id="invoiceClosing"
											bind:value={billingDraft.invoiceClosingTemplate}
											rows="3"
											class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
									</div>
								</div>
								<div class="flex gap-2">
									<Button icon="save" type="submit" disabled={savingBilling}>
										{savingBilling ? 'Saving…' : 'Save'}
									</Button>
									<Button
										icon="close"
										type="button"
										variant="outline"
										onclick={() => (editingBilling = false)}
									>
										Cancel
									</Button>
								</div>
							</form>
						{:else}
							<div class="space-y-3 text-sm">
								<div>
									<p class="text-muted-foreground">Address</p>
									<p>
										{#if org.address}
											{org.address.line1}{#if org.address.line2}, {org.address.line2}{/if},
											{org.address.postalCode}
											{org.address.city}
										{:else}
											Not set
										{/if}
									</p>
								</div>
								<div>
									<p class="text-muted-foreground">Tax ID</p>
									<p>{org.taxId ?? 'Not set'}</p>
								</div>
								<div>
									<p class="text-muted-foreground">Bank account</p>
									<p>
										{#if org.iban}
											{org.bankAccountHolder ?? ''} · {org.iban} · {org.bic ?? ''}
										{:else}
											Not set
										{/if}
									</p>
								</div>
								<Button
									icon="edit"
									variant="outline"
									size="sm"
									class="w-full"
									onclick={() => (editingBilling = true)}
								>
									Edit
								</Button>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title>Add Member</Card.Title>
						<Card.Description>
							Add a registered user to this organization by email.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<form onsubmit={handleAddUser} class="space-y-4">
							<div class="space-y-2">
								<Label for="addEmail">Email address</Label>
								<Input
									id="addEmail"
									type="email"
									bind:value={addEmail}
									placeholder="user@example.com"
									required
								/>
							</div>
							<div class="space-y-2">
								<Label for="addRole">Role</Label>
								<select
									id="addRole"
									bind:value={addRole}
									class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									<option value="VIEWER">Viewer</option>
									<option value="MEMBER">Member</option>
									<option value="ADMIN">Admin</option>
									<option value="OWNER">Owner</option>
								</select>
							</div>
							<Button type="submit" disabled={adding} class="w-full">
								{adding ? 'Adding...' : 'Add Member'}
							</Button>
						</form>
					</Card.Content>
				</Card.Root>
			</div>
		{/if}

		<div class="space-y-4 {canManage ? 'lg:col-span-2' : 'lg:col-span-3'}">
			<h2 class="text-xl font-semibold">Members ({org.members.length})</h2>
			<div class="space-y-2">
				{#each org.members as membership (membership.id)}
					<Card.Root>
						<Card.Content class="flex items-center justify-between py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<p class="truncate font-medium">
										{membership.user.name || membership.user.email}
									</p>
									{#if membership.user.isAdmin}
										<span
											class="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
										>
											System Admin
										</span>
									{/if}
								</div>
								<p class="truncate text-sm text-muted-foreground">{membership.user.email}</p>
							</div>
							<div class="ml-4 flex items-center gap-2">
								{#if canManage && membership.userId !== data.user?.id}
									<select
										value={membership.role}
										onchange={(e) =>
											handleRoleChange(membership.userId, (e.target as HTMLSelectElement).value)}
										class="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										<option value="VIEWER">Viewer</option>
										<option value="MEMBER">Member</option>
										<option value="ADMIN">Admin</option>
										<option value="OWNER">Owner</option>
									</select>
									<Button
										variant="destructive"
										size="sm"
										onclick={() =>
											handleRemove(
												membership.userId,
												membership.user.name || membership.user.email
											)}
									>
										Remove
									</Button>
								{:else}
									<span
										class="rounded-md border border-input bg-background px-2 py-1 text-sm text-muted-foreground"
									>
										{roleLabels[membership.role]}
									</span>
								{/if}
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		</div>
	</div>
</div>

<Modal bind:open={deleteOpen} title="Delete organization" dismissible={!deleting}>
	{#snippet description()}
		This permanently deletes the organization and all of its locations, assets, productions, offers,
		and invoices.
	{/snippet}
	<p class="text-sm">
		Delete <span class="font-medium">{org.name}</span> and all of its data?
	</p>
	{#snippet footer()}
		<Button icon="close" variant="outline" onclick={() => (deleteOpen = false)} disabled={deleting}
			>Cancel</Button
		>
		<Button icon="delete" variant="destructive" onclick={handleDeleteOrg} disabled={deleting}>
			{deleting ? 'Deleting…' : 'Delete organization'}
		</Button>
	{/snippet}
</Modal>
