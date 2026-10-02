<script lang="ts">
	import { LegalLinks } from '#lib/components/ui/legal-links/index.js';
	import { requestPasswordReset } from '#lib/auth-client.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { resolve } from '$app/paths';

	let email = $state('');
	let loading = $state(false);
	let error = $state('');
	let sent = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';

		await requestPasswordReset(
			{ email, redirectTo: resolve('auth/reset-password') },
			{
				onSuccess: () => {
					sent = true;
					loading = false;
				},
				onError: (ctx) => {
					error = ctx.error.message;
					loading = false;
				}
			}
		);
	}
</script>

<svelte:head><title>Forgot password | Technikpool</title></svelte:head>

<div
	class="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-4 dark:bg-zinc-950"
>
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title class="text-2xl font-bold">Reset your password</Card.Title>
			<Card.Description>
				Enter your email and we'll send you a link to reset your password.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if sent}
				<p class="text-sm font-medium text-emerald-600">
					If that email exists in our system, a reset link is on its way.
				</p>
			{:else}
				<form onsubmit={handleSubmit} class="space-y-4">
					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="m@example.com"
							bind:value={email}
							required
						/>
					</div>
					{#if error}
						<p class="text-sm font-medium text-destructive">{error}</p>
					{/if}
					<Button icon="send" type="submit" class="w-full" disabled={loading}>
						{loading ? 'Sending...' : 'Send reset link'}
					</Button>
				</form>
			{/if}
			<div class="mt-4 text-center text-sm">
				<a href={resolve('auth/login')} class="underline">Back to login</a>
			</div>
		</Card.Content>
	</Card.Root>
	<LegalLinks />
</div>
