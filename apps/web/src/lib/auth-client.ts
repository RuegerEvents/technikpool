import { createAuthClient } from 'better-auth/svelte';
import { env } from '$env/dynamic/public';

export const authClient = createAuthClient({
	baseURL: env.PUBLIC_BETTER_AUTH_BASE_URL
});

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword } =
	authClient;
