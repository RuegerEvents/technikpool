import { createAuthClient } from 'better-auth/svelte';
import { PUBLIC_BETTER_AUTH_BASE_URL } from '$app/env/public';

export const authClient = createAuthClient({
	baseURL: PUBLIC_BETTER_AUTH_BASE_URL
});

export const {
	signIn,
	signUp,
	signOut,
	useSession,
	requestPasswordReset,
	resetPassword,
	updateUser,
	changeEmail,
	changePassword,
	deleteUser
} = authClient;
