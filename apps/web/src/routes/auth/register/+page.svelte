<script lang="ts">
	import { signUp } from '$lib/auth-client';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getInvitationPreview, getSignUpStatus } from '$lib/remote/invitations.remote';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';

	// Same contract as the login page — see the auth guard in hooks.server.ts.
	let redirectTo = $derived.by(() => {
		const raw = page.url.searchParams.get('redirectTo');
		return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
	});

	let loginHref = $derived(
		redirectTo
			? `${resolve('/auth/login')}?redirectTo=${encodeURIComponent(redirectTo)}`
			: resolve('/auth/login')
	);

	// An invitation link carries its token here. It is sent along with the
	// sign-up and checked again on the server; what is read below only decides
	// what the form looks like.
	let inviteToken = $derived(page.url.searchParams.get('invite'));
	let statusQuery = $derived(getSignUpStatus());
	let inviteQuery = $derived(inviteToken ? getInvitationPreview(inviteToken) : null);
	let invite = $derived(inviteQuery?.current ?? null);
	let ready = $derived(statusQuery.ready && (!inviteQuery || inviteQuery.ready));
	let closed = $derived(ready && !invite && !statusQuery.current?.open);

	// better-auth answers in English; the codes the sign-up gate throws are ours.
	function refusalMessage(code: string | undefined, fallback: string) {
		switch (code) {
			case 'SIGNUP_DISABLED':
				return 'Sign-up is by invitation only.';
			case 'INVITATION_INVALID':
				return 'This invitation is no longer valid.';
			case 'INVITATION_EMAIL_MISMATCH':
				return 'This invitation was issued for a different email address.';
			default:
				return fallback;
		}
	}

	let name = $state('');
	let typedEmail = $state('');
	let email = $derived(invite?.email ?? typedEmail);
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
				name,
				...(invite && inviteToken ? { inviteToken } : {})
			},
			{
				onSuccess: async () => {
					success = true;
					loading = false;
					await invalidateAll();
					// eslint-disable-next-line svelte/no-navigation-without-resolve
					if (redirectTo) goto(redirectTo);
					else goto(resolve('/'));
				},
				onError: (ctx) => {
					error = refusalMessage(ctx.error.code, ctx.error.message);
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
			<Card.Description>
				{#if invite?.organizationName}
					You have been invited to join {invite.organizationName}.
				{:else if invite}
					You have been invited to Technikpool.
				{:else}
					Enter your information to create an account
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if !ready}
				<ContentSkeleton shape="form" count={3} error={statusQuery.error ?? inviteQuery?.error} />
			{:else if closed}
				<div class="space-y-2 text-sm">
					{#if inviteToken}
						<p class="font-medium text-destructive">This invitation is no longer valid.</p>
					{/if}
					<p class="text-muted-foreground">
						Sign-up is by invitation only. Ask an administrator or the owner of your organization to
						send you an invitation.
					</p>
				</div>
			{:else}
				<form onsubmit={handleRegister} class="space-y-4">
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input id="name" placeholder="John Doe" bind:value={name} required />
					</div>
					<div class="space-y-2">
						<Label for="email">Email</Label>
						{#if invite}
							<Input id="email" type="email" value={invite.email} readonly />
							<p class="text-xs text-muted-foreground">The invitation is tied to this address.</p>
						{:else}
							<Input
								id="email"
								type="email"
								placeholder="m@example.com"
								bind:value={typedEmail}
								required
							/>
						{/if}
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
					<Button icon="signup" type="submit" class="w-full" disabled={loading || success}>
						{loading ? 'Creating account...' : 'Create an account'}
					</Button>
				</form>
			{/if}
			<div class="mt-4 text-center text-sm">
				Already have an account?
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={loginHref} class="underline"> Login </a>
			</div>
		</Card.Content>
	</Card.Root>
</div>
