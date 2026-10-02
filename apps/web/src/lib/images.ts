import { PUBLIC_S3_URL_BASE } from '$app/env/public';

/**
 * Where the object store is reachable from a *browser* — e.g. a reverse-proxied
 * path in front of the S3-compatible server, or a CDN. Read through
 * `$app/env/public` as a dynamic variable (see `src/env.ts`) rather than baked
 * in at build time, so moving the store is an env change and a restart, not a
 * rebuild.
 *
 * It has to be absolute: `/api/v1` hands the resolved address to the scanner
 * app, which has no origin of its own to resolve a relative one against.
 */
function base(): string {
	return PUBLIC_S3_URL_BASE.replace(/\/+$/, '');
}

/**
 * Turns a stored object key (`product-images/<uuid>.png`) into the address it
 * loads from. Only the key is stored, so the whole estate follows the store
 * when it moves — a row that had the old host baked into it would not.
 *
 * Rows written before that are absolute URLs already and are passed through, so
 * an installation whose data predates the change keeps rendering while its
 * images are re-pointed.
 */
export function imageSrc(path: string | null | undefined): string | null {
	if (!path) return null;
	if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
	return `${base()}/${path.replace(/^\/+/, '')}`;
}
