import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
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
	Customer: 'cust',
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
	Invoice: 'inv',
	InvoiceItem: 'ivi',
	InvoiceSequence: 'invs'
};

// Extend the client with prefixed IDs
export const prisma = extendPrismaClient(originalPrisma, {
	prefixes
});

export const auth = building
	? (null as unknown as ReturnType<typeof betterAuth>)
	: betterAuth({
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
			}
		});
