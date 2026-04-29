<script lang="ts">
	import { signUp } from '$lib/auth-client';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);

	async function handleRegister(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';

		await signUp.email(
			{
				email,
				password,
				name
			},
			{
				onSuccess: async () => {
					success = true;
					loading = false;
					await invalidateAll();
					goto(resolve('/'));
				},
				onError: (ctx) => {
					error = ctx.error.message;
					loading = false;
				}
			}
		);
	}
</script>

<svelte:head><title>Register | Technikpool</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl font-bold">Sign up for Technikpool</Card.Title>
			<Card.Description>Enter your information to create an account</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleRegister} class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" placeholder="John Doe" bind:value={name} required />
				</div>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" type="email" placeholder="m@example.com" bind:value={email} required />
				</div>
				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input id="password" type="password" bind:value={password} required />
				</div>
				{#if error}
					<p class="text-sm font-medium text-destructive">{error}</p>
				{/if}
				{#if success}
					<p class="text-sm font-medium text-emerald-600">Account created! Redirecting…</p>
				{/if}
				<Button type="submit" class="w-full" disabled={loading || success}>
					{loading ? 'Creating account...' : 'Create an account'}
				</Button>
			</form>
			<div class="mt-4 text-center text-sm">
				Already have an account?
				<a href={resolve('/auth/login')} class="underline"> Login </a>
			</div>
		</Card.Content>
	</Card.Root>
</div>
