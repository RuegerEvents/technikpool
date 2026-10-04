import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import { Prisma, PrismaClient } from '#lib/prisma/client.js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { extendPrismaClient } from 'prisma-prefixed-ids';
import { building } from '$app/env';
import { sendMail } from './mail';
import { passwordResetEmail } from './emails/password-reset';
import { passwordChangedEmail } from './emails/password-changed';
import { emailVerificationEmail } from './emails/email-verification';
import { emailChangeConfirmationEmail } from './emails/email-change-confirmation';
import { completeSignUp, decideSignUp, signUpRefusalMessages } from './signup-gate';
import { accountDeletionBlocker } from './services/account-deletion';
import { USER_CODE_LENGTH } from '#lib/device-code.js';
import { appError } from '#lib/errors.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const originalPrisma = new PrismaClient({ adapter });

type ModelName = Prisma.ModelName;

// Define your model prefixes as an object
const prefixes: Partial<Record<ModelName, string>> = {
	Account: 'acct',
	Address: 'addr',
	Asset: 'asset',
	AssetBundle: 'astb',
	AssetTransaction: 'astx',
	BundleTemplate: 'bndt',
	CableWay: 'cway',
	Category: 'catg',
	Connector: 'conn',
	Customer: 'cust',
	DeviceCode: 'dvc',
	Manufacturer: 'mfr',
	Organization: 'org',
	OrgMembership: 'orgm',
	Product: 'prd',
	ProductPort: 'prdp',
	ProductDocument: 'pdoc',
	Production: 'prdn',
	ProductionCrew: 'prdc',
	ProductionItem: 'prdi',
	Session: 'sess',
	User: 'usr',
	Verification: 'ver',
	Location: 'loc',
	Inspection: 'insp',
	OrgCategoryRate: 'ocr',
	ServiceCategory: 'svcc',
	OrgService: 'osvc',
	Offer: 'ofr',
	OfferItem: 'ofi',
	OfferSequence: 'ofsq',
	Invoice: 'inv',
	InvoiceItem: 'ivi',
	OrgProductPrice: 'opp',
	CatalogTransaction: 'cltx',
	LicenseCredential: 'lcrd',
	Invitation: 'invt',
	Stocktake: 'stk',
	StocktakeItem: 'stki',
	StocktakeLine: 'stkl',
	StocktakeCount: 'stkc',
	StocktakeEvent: 'stke',
	LegalDocument: 'lgl',
	DpaAcceptance: 'dpaa',
	ProductionCheck: 'prck',
	ProductionCheckTick: 'prct',
	LoanRequest: 'lnrq',
	BillingDismissal: 'bdis',
	UserDefaultLocation: 'udl'
};

// Extend the client with prefixed IDs
const prefixedPrisma = extendPrismaClient(originalPrisma, {
	prefixes
});

// A `findUniqueOrThrow` that misses, or an update or delete of a row that is
// gone, rejects with P2025 — which SvelteKit can only answer with a bare 500.
// Nearly every one of those is an id out of a URL or a stale page, so it is a
// 404 here, once, instead of a null check at each of the many call sites. The
// auth adapter keeps the plain client: better-auth handles its own misses.
// Cast back because a query-only extension changes no signature, while its
// inferred type no longer passes for `Prisma.TransactionClient`.
export const prisma = prefixedPrisma.$extends({
	name: 'notFoundAs404',
	query: {
		async $allOperations({ args, query }) {
			try {
				return await query(args);
			} catch (err) {
				if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
					appError(404, 'record_not_found');
				}
				throw err;
			}
		}
	}
}) as unknown as typeof prefixedPrisma;

function inviteTokenOf(body: unknown) {
	const token = (body as { inviteToken?: unknown } | null | undefined)?.inviteToken;
	return typeof token === 'string' ? token : null;
}

// Wrapped in a factory so `auth` can be typed as the *configured* instance.
// `ReturnType<typeof betterAuth>` would erase the plugins' endpoints, leaving
// auth.api.deviceApprove and friends invisible to TypeScript. The body is only
// evaluated at runtime, so the build-time guard still holds.
const createAuth = () =>
	betterAuth({
		database: prismaAdapter(prefixedPrisma, {
			provider: 'postgresql'
		}),
		emailAndPassword: {
			enabled: true,
			sendResetPassword: async ({ user, url }) => {
				const { subject, html, text } = passwordResetEmail({ name: user.name, url });
				await sendMail({ to: user.email, subject, html, text });
			},
			onPasswordReset: async ({ user }) => {
				const { subject, html, text } = passwordChangedEmail({ name: user.name });
				await sendMail({ to: user.email, subject, html, text });
			}
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				// An invited account is verified by the link it came in through;
				// better-auth sends this on every sign-up regardless.
				if (user.emailVerified) return;
				const { subject, html, text } = emailVerificationEmail({ name: user.name, url });
				await sendMail({ to: user.email, subject, html, text });
			}
		},
		user: {
			changeEmail: {
				enabled: true,
				// Confirmation goes to the address on file. `updateEmailWithoutVerification`
				// is deliberately left off: an account whose address was never verified
				// would otherwise move on a single click, with no second party to object.
				sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
					const { subject, html, text } = emailChangeConfirmationEmail({
						name: user.name,
						newEmail,
						url
					});
					await sendMail({ to: user.email, subject, html, text });
				}
			},
			// Anyone may delete their own account from /profile (GDPR Art. 17), with
			// their password. Their history stays, anonymised by the SetNull foreign
			// keys; what stops it is an org or an install left without anyone in charge.
			deleteUser: {
				enabled: true,
				beforeDelete: async (user) => {
					const blocker = await accountDeletionBlocker(prisma, user.id);
					if (blocker) {
						throw new APIError('CONFLICT', {
							code: blocker.code,
							params: blocker.code === 'last_org_owner' ? [blocker.orgName] : [],
							message: blocker.code
						});
					}
				}
			}
		},
		// Sign-up is gated where the row is written rather than on the
		// /sign-up/email path, so a second way of creating accounts (a social
		// provider, say) cannot arrive without passing it. The register form
		// sends the invitation token along as an extra body field.
		databaseHooks: {
			user: {
				create: {
					before: async (user, ctx) => {
						const decision = await decideSignUp(prisma, {
							email: user.email,
							token: inviteTokenOf(ctx?.body)
						});
						if (!decision.allowed) {
							throw new APIError('FORBIDDEN', {
								code: decision.reason,
								message: signUpRefusalMessages[decision.reason]
							});
						}
						if (decision.invited) return { data: { ...user, emailVerified: true } };
					},
					after: async (user, ctx) => {
						await completeSignUp(prisma, {
							userId: user.id,
							email: user.email,
							token: inviteTokenOf(ctx?.body)
						});
					}
				}
			}
		},
		plugins: [
			// Lets non-browser clients (the Flutter scanner) authenticate with
			// `Authorization: Bearer <session token>`. The plugin rewrites that header
			// into the session cookie before better-auth reads it, so hooks.server.ts
			// populates locals.user for API requests without any extra work. It also
			// mirrors the token into a `set-auth-token` response header on sign-in,
			// which is how a native client gets hold of it in the first place.
			bearer(),
			// RFC 8628 device flow: the PDA shows a short code, a signed-in user
			// approves it at /devices, and the PDA polls until it receives a session
			// token. Beats typing a password on a rugged keypad.
			deviceAuthorization({
				expiresIn: '15m',
				interval: '5s',
				// Stated rather than left to the plugin's default, because /devices
				// refuses anything of another length.
				userCodeLength: USER_CODE_LENGTH,
				// Where the plugin tells devices to send their user. Must match the
				// route below; it also ends up in verification_uri_complete.
				verificationUri: '/devices'
			})
		]
	});

export const auth = building ? (null as unknown as ReturnType<typeof createAuth>) : createAuth();
