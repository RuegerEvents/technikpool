import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

// Sealing for the few values that must be stored but never read back casually
// — licence keys and the accounts licences are used through. AES-256-GCM, so a
// tampered row fails to open rather than opening as something else.
//
// The key is its own variable rather than derived from BETTER_AUTH_SECRET: that
// one is rotated when a session leak is suspected, and rotating it must not
// quietly turn every stored licence into noise. Losing *this* one does exactly
// that, which is why it is only ever read here.

const VERSION = 'v1';
const INFO = 'technikpool/license-credentials/v1';

function key(): Buffer {
	// `$env` rather than `process.env`: the dev server re-reads .env on a change,
	// where `process.env` keeps whatever it held when the process started.
	const secret = env.CREDENTIALS_ENCRYPTION_KEY;
	// Misconfiguration no user can act on, so a plain throw — see CLAUDE.md, "Errors".
	if (!secret) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not set');
	return Buffer.from(hkdfSync('sha256', secret, '', INFO, 32));
}

/** `v1:<iv>:<tag>:<ciphertext>`, each part base64. */
export function sealSecret(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const parts = [iv, cipher.getAuthTag(), data].map((p) => p.toString('base64'));
	return [VERSION, ...parts].join(':');
}

export function openSecret(sealed: string): string {
	const [version, iv, tag, data] = sealed.split(':');
	if (version !== VERSION || !iv || !tag || data === undefined) {
		throw new Error('Unrecognised sealed secret');
	}
	const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
		'utf8'
	);
}
