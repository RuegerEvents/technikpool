<script lang="ts">
	import { changeEmail, changePassword, deleteUser, updateUser } from '#lib/auth-client.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { messageForErrorCode } from '#lib/error-messages.svelte.js';
	import type { AppErrorCode } from '#lib/errors.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { refreshAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	// Three independent forms rather than one Save: they fail for unrelated
	// reasons and two of them do not take effect at the moment you submit, so a
	// single button could not honestly report what happened.
	// A writable $derived: it takes the server's value, the field writes over it
	// while you type, and it resets to whatever came back once `refreshAll()`
	// reloads the layout data after a save.
	let name = $derived(data.user?.name ?? '');
	let savingName = $state(false);

	let newEmail = $state('');
	let savingEmail = $state(false);

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let savingPassword = $state(false);

	let nameChanged = $derived(name.trim() !== (data.user?.name ?? '').trim());
	let passwordMismatch = $derived(confirmPassword.length > 0 && newPassword !== confirmPassword);

	async function handleName(e: Event) {
		e.preventDefault();
		if (!nameChanged || !name.trim()) return;
		savingName = true;
		await updateUser(
			{ name: name.trim() },
			{
				onSuccess: async () => {
					// The header reads the name from the layout's server data, so it keeps
					// showing the old one until that is reloaded.
					await refreshAll();
					toast.success('Name updated');
					savingName = false;
				},
				onError: (ctx) => {
					toast.error(ctx.error.message);
					savingName = false;
				}
			}
		);
	}

	async function handleEmail(e: Event) {
		e.preventDefault();
		const target = newEmail.trim().toLowerCase();
		if (!target || target === data.user?.email?.toLowerCase()) return;
		savingEmail = true;
		await changeEmail(
			{ newEmail: target, callbackURL: '/profile' },
			{
				onSuccess: () => {
					// Deliberately vague about which inbox and about whether anything
					// happened at all: the server answers the same way when the address is
					// already taken, so that a stranger can't use this form to find out who
					// has an account here.
					toast.success('Check your inbox for the confirmation link.');
					newEmail = '';
					savingEmail = false;
				},
				onError: (ctx) => {
					toast.error(ctx.error.message);
					savingEmail = false;
				}
			}
		);
	}

	async function handlePassword(e: Event) {
		e.preventDefault();
		if (!currentPassword || !newPassword || passwordMismatch) return;
		savingPassword = true;
		await changePassword(
			{
				currentPassword,
				newPassword,
				// Everything else signed in with the old password stops here — a
				// password change is usually a reaction to something.
				revokeOtherSessions: true
			},
			{
				onSuccess: () => {
					toast.success('Password changed. Other devices have been signed out.');
					currentPassword = '';
					newPassword = '';
					confirmPassword = '';
					savingPassword = false;
				},
				onError: (ctx) => {
					toast.error(ctx.error.message);
					savingPassword = false;
				}
			}
		);
	}

	let deleteOpen = $state(false);
	let deletePassword = $state('');
	let deleting = $state(false);

	async function handleDelete(e: Event) {
		e.preventDefault();
		if (!deletePassword || deleting) return;
		deleting = true;
		await deleteUser(
			{ password: deletePassword },
			{
				onSuccess: async () => {
					deleteOpen = false;
					toast.success('Your account has been deleted.');
					await goto(resolve('auth/login'), { refreshAll: true });
				},
				onError: (ctx) => {
					// A blocker from account-deletion.ts carries one of our own codes;
					// a wrong password comes back in better-auth's wording.
					const { code, params } = ctx.error as { code?: string; params?: unknown[] };
					const ours = code === 'last_org_owner' || code === 'last_system_admin';
					toast.error(
						ours
							? messageForErrorCode(code as AppErrorCode, (params ?? []) as string[])
							: ctx.error.message
					);
					deleting = false;
				}
			}
		);
	}
</script>

<svelte:head><title>Profile | Technikpool</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Profile</h1>
		<p class="text-sm text-muted-foreground">{data.user?.email}</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Name</Card.Title>
			<Card.Description>How you appear to the other members of your organizations.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleName} class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" bind:value={name} required />
				</div>
				<Button type="submit" disabled={savingName || !nameChanged || !name.trim()}>
					{savingName ? 'Saving…' : 'Save name'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Email address</Card.Title>
			<Card.Description>
				Currently <span class="font-medium">{data.user?.email}</span>. Changing it takes a
				confirmation link sent to that address — the new one only takes effect once you follow it.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleEmail} class="space-y-4">
				<div class="space-y-2">
					<Label for="newEmail">New email address</Label>
					<Input
						id="newEmail"
						type="email"
						bind:value={newEmail}
						placeholder="new@example.com"
						required
					/>
				</div>
				<Button type="submit" disabled={savingEmail || !newEmail.trim()}>
					{savingEmail ? 'Sending…' : 'Send confirmation link'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Password</Card.Title>
			<Card.Description>
				Changing your password signs out every other device, including paired scanners.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handlePassword} class="space-y-4">
				<div class="space-y-2">
					<Label for="currentPassword">Current password</Label>
					<Input
						id="currentPassword"
						type="password"
						bind:value={currentPassword}
						autocomplete="current-password"
						required
					/>
				</div>
				<div class="space-y-2">
					<Label for="newPassword">New password</Label>
					<Input
						id="newPassword"
						type="password"
						bind:value={newPassword}
						autocomplete="new-password"
						required
					/>
				</div>
				<div class="space-y-2">
					<Label for="confirmPassword">Repeat new password</Label>
					<Input
						id="confirmPassword"
						type="password"
						bind:value={confirmPassword}
						autocomplete="new-password"
						required
					/>
					{#if passwordMismatch}
						<p class="text-sm text-destructive">The two passwords do not match.</p>
					{/if}
				</div>
				<Button
					type="submit"
					disabled={savingPassword || !currentPassword || !newPassword || passwordMismatch}
				>
					{savingPassword ? 'Changing…' : 'Change password'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-destructive/40">
		<Card.Header>
			<Card.Title>Delete account</Card.Title>
			<Card.Description>
				Removes your account, your sessions and paired scanners, and your memberships. Entries you
				made in the history of devices and stocktakes stay, without your name.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button icon="delete" variant="destructive" onclick={() => (deleteOpen = true)}
				>Delete account…</Button
			>
		</Card.Content>
	</Card.Root>
</div>

<Modal bind:open={deleteOpen} title="Delete account" dismissible={!deleting}>
	<form id="delete-account" onsubmit={handleDelete} class="space-y-2">
		<Label for="deletePassword">Confirm with your password</Label>
		<Input
			id="deletePassword"
			type="password"
			bind:value={deletePassword}
			autocomplete="current-password"
			required
		/>
	</form>
	{#snippet description()}
		This cannot be undone. If you are the only owner of an organization, make someone else owner or
		delete the organization first.
	{/snippet}
	{#snippet footer()}
		<Button
			icon="delete"
			variant="destructive"
			type="submit"
			form="delete-account"
			disabled={deleting || !deletePassword}
		>
			{deleting ? 'Deleting…' : 'Delete account'}
		</Button>
		<Button icon="close" variant="outline" onclick={() => (deleteOpen = false)} disabled={deleting}
			>Cancel</Button
		>
	{/snippet}
</Modal>
