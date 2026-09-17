// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// Remote functions answer with `appError` (src/lib/errors.ts), which puts a stable
		// code and its interpolated values in the body. The client translates from the code
		// and only falls back to `message`.
		interface Error {
			message: string;
			code?: import('$lib/errors').AppErrorCode;
			params?: import('$lib/errors').ErrorParams;
		}
		interface Locals {
			user: import('better-auth').User | null;
			session: import('better-auth').Session | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
