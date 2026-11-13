import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

// The variables read through `$app/env/*`. Everything else (DATABASE_URL,
// S3_*, SMTP_*, BETTER_AUTH_SECRET …) is read from `process.env` by the code
// that needs it. All three are optional here so the app starts without them:
// the features that need them fail at the point of use instead.
export const variables = defineEnvVars({
	PUBLIC_BETTER_AUTH_BASE_URL: {
		public: true,
		description: 'The public origin better-auth issues sessions and device codes against',
		schema: v.optional(v.string())
	},
	PUBLIC_S3_URL_BASE: {
		public: true,
		description: 'Absolute address the object store is reachable at from a browser',
		schema: v.optional(v.string(), '')
	},
	LABEL_RENDER_URL: {
		description:
			'A zebrash-api (deinticketshop/zebrash-api) that draws case label previews, e.g. http://zebrash:3009. Unset: the scanner asks labelary.com',
		schema: v.optional(v.string())
	},
	CREDENTIALS_ENCRYPTION_KEY: {
		description:
			'Seals license credentials. Changing or losing it makes every stored key unreadable',
		schema: v.optional(v.string())
	}
});
