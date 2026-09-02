import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { Prisma, PrismaClient } from '$lib/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { extendPrismaClient } from 'prisma-prefixed-ids';
import { building } from '$app/environment';
import { sendMail } from './mail';
import { passwordResetEmail } from './emails/password-reset';
import { passwordChangedEmail } from './emails/password-changed';
import { emailVerificationEmail } from './emails/email-verification';

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
	Category: 'catg',
	Connector: 'conn',
	Customer: 'cust',
	DeviceCode: 'dvc',
	Manufacturer: 'mfr',
	Organization: 'org',
	OrgMembership: 'orgm',
	Product: 'prd',
	Production: 'prdn',
	ProductionCrew: 'prdc',
	ProductionItem: 'prdi',
	Session: 'sess',
	User: 'usr',
	Verification: 'ver',
	Location: 'loc',
	Inspection: 'insp',
	OrgCategoryRate: 'ocr',
	Offer: 'ofr',
	OfferItem: 'ofi',
	OfferSequence: 'ofsq',
	Invoice: 'inv',
	InvoiceItem: 'ivi',
	OrgProductPrice: 'opp',
	CatalogTransaction: 'cltx'
};

// Extend the client with prefixed IDs
export const prisma = extendPrismaClient(originalPrisma, {
	prefixes
});

// Wrapped in a factory so `auth` can be typed as the *configured* instance.
// `ReturnType<typeof betterAuth>` would erase the plugins' endpoints, leaving
// auth.api.deviceApprove and friends invisible to TypeScript. The body is only
// evaluated at runtime, so the build-time guard still holds.
const createAuth = () =>
	betterAuth({
		database: prismaAdapter(prisma, {
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
				const { subject, html, text } = emailVerificationEmail({ name: user.name, url });
				await sendMail({ to: user.email, subject, html, text });
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
				// Where the plugin tells devices to send their user. Must match the
				// route below; it also ends up in verification_uri_complete.
				verificationUri: '/devices'
			})
		]
	});

export const auth = building ? (null as unknown as ReturnType<typeof createAuth>) : createAuth();
