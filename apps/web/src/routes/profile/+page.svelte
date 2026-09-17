<script lang="ts">
	import { changeEmail, changePassword, updateUser } from '$lib/auth-client';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	// Three independent forms rather than one Save: they fail for unrelated
	// reasons and two of them do not take effect at the moment you submit, so a
	// single button could not honestly report what happened.
	// A writable $derived: it takes the server's value, the field writes over it
	// while you type, and it resets to whatever came back once `invalidateAll()`
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
					await invalidateAll();
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
</div>
