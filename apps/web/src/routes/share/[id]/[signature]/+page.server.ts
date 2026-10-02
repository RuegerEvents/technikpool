import type { PageServerLoad } from './$types';
import { resolveShare } from '#lib/server/services/production-share.js';

// No session here: the signed URL is the whole credential. A link that does
// not open — wrong, revoked, expired — renders the same "no longer valid"
// page, rather than an error that would tell a guesser which it was.
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	// Personal to one job, so kept out of shared caches and search engines.
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	return { view: await resolveShare(params.id, params.signature) };
};
