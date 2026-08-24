import nodemailer from 'nodemailer';
import { dev } from '$app/environment';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// In dev there's no SMTP server around, so messages are written to disk as
// .eml files instead of actually being sent (they can be opened in any mail
// client to preview the rendered result).
const devMailDir = process.env.MAIL_DEV_DIR ?? '.mail-dev';

const transporter = dev
	? nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true })
	: nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port: Number(process.env.SMTP_PORT ?? 587),
			secure: process.env.SMTP_SECURE === 'true',
			auth: process.env.SMTP_USER
				? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
				: undefined
		});

const from = process.env.SMTP_FROM ?? 'Technikpool <no-reply@technikpool.local>';

export async function sendMail(options: {
	to: string;
	subject: string;
	html: string;
	text: string;
}) {
	const info = await transporter.sendMail({
		from,
		to: options.to,
		subject: options.subject,
		html: options.html,
		text: options.text
	});

	if (dev) {
		await mkdir(devMailDir, { recursive: true });
		const safeTo = options.to.replace(/[^a-z0-9@.]/gi, '_');
		const file = path.join(devMailDir, `${Date.now()}-${safeTo}.eml`);
		await writeFile(file, (info as unknown as { message: Buffer }).message);
		console.log(`[mail] dev email saved to ${file}`);
	}
}
