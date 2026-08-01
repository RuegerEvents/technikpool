<script lang="ts">
	import { resetPassword } from '$lib/auth-client';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let token = $derived(page.url.searchParams.get('token') ?? '');
	let tokenError = $derived(page.url.searchParams.get('error') === 'INVALID_TOKEN');

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;
		await resetPassword(
			{ newPassword: password, token },
			{
				onSuccess: () => {
					success = true;
					loading = false;
					goto(resolve('/auth/login'));
				},
				onError: (ctx) => {
					error = ctx.error.message;
					loading = false;
				}
			}
		);
	}
</script>

<svelte:head><title>Reset password | Technikpool</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl font-bold">Choose a new password</Card.Title>
			<Card.Description>Enter a new password for your account.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if tokenError || !token}
				<p class="text-sm font-medium text-destructive">
					This reset link is invalid or has expired.
				</p>
				<div class="mt-4 text-center text-sm">
					<a href={resolve('/auth/forgot-password')} class="underline">Request a new reset link</a>
				</div>
			{:else}
				<form onsubmit={handleSubmit} class="space-y-4">
					<div class="space-y-2">
						<Label for="password">New password</Label>
						<Input id="password" type="password" bind:value={password} required />
					</div>
					<div class="space-y-2">
						<Label for="confirmPassword">Confirm password</Label>
						<Input id="confirmPassword" type="password" bind:value={confirmPassword} required />
					</div>
					{#if error}
						<p class="text-sm font-medium text-destructive">{error}</p>
					{/if}
					<Button type="submit" class="w-full" disabled={loading || success}>
						{loading ? 'Saving...' : 'Save new password'}
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
