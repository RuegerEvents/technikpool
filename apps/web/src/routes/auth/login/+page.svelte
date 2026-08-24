<script lang="ts">
	import { signIn } from '$lib/auth-client';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');

	// Set by the server-side auth guard. Only same-origin paths are honoured, so
	// a crafted ?redirectTo=//evil.com can't bounce the user off-site.
	let redirectTo = $derived.by(() => {
		const raw = page.url.searchParams.get('redirectTo');
		return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
	});

	let registerHref = $derived(
		redirectTo
			? `${resolve('/auth/register')}?redirectTo=${encodeURIComponent(redirectTo)}`
			: resolve('/auth/register')
	);

	async function handleLogin(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';

		await signIn.email(
			{
				email,
				password
			},
			{
				onSuccess: async () => {
					await invalidateAll();
					// eslint-disable-next-line svelte/no-navigation-without-resolve
					if (redirectTo) goto(redirectTo);
					else goto(resolve('/'));
				},
				onError: (ctx) => {
					error = ctx.error.message;
					loading = false;
				}
			}
		);
	}
</script>

<svelte:head><title>Login | Technikpool</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl font-bold">Login to Technikpool</Card.Title>
			<Card.Description>Enter your email below to login to your account</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleLogin} class="space-y-4">
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" type="email" placeholder="m@example.com" bind:value={email} required />
				</div>
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label for="password">Password</Label>
						<a href={resolve('/auth/forgot-password')} class="text-sm underline">
							Forgot password?
						</a>
					</div>
					<Input id="password" type="password" bind:value={password} required />
				</div>
				{#if error}
					<p class="text-sm font-medium text-destructive">{error}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? 'Logging in...' : 'Login'}
				</Button>
			</form>
			<div class="mt-4 text-center text-sm">
				Don't have an account?
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={registerHref} class="underline"> Sign up </a>
			</div>
		</Card.Content>
	</Card.Root>
</div>
