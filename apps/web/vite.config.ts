import adapter from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { wuchale } from 'wuchale/vite';

// wuchale compiles a *numeric catalog slot* into every translated string
// (`$.get(_w_runtime_)(499)`), so a component only renders correctly against the
// catalog it was transformed for. Anything that renumbers the catalogs leaves
// already-transformed modules pointing at the wrong slots, and the page renders
// every string one or more positions off — wuchale's own HMR reloads the
// catalogs but not the modules that index into them. Re-transforming is the
// only fix, and until this existed that meant restarting the dev server.
//
// It fires on *every* .po write rather than trying to tell the dev server's own
// extraction apart from an external one. An edit that adds or changes no string
// writes no .po at all, so ordinary HMR never reaches this and keeps its page
// state.
//
// **When it fires is the whole point.** wuchale re-reads and recompiles a
// changed catalog in its own HMR hook, asynchronously. This used to listen on
// the file watcher, which runs *before* that hook: the modules were invalidated
// and the browser reloaded while wuchale still held the old catalog, so they
// were re-transformed against the very slots that had just gone stale — and a
// second `touch` of the .po "fixed" it only because by then the catalog was
// loaded. As a `hotUpdate` hook listed after `wuchale()` it runs once wuchale's
// own hook has finished (Vite awaits them in order).
function wuchaleCatalogReload(): Plugin {
	return {
		name: 'wuchale-catalog-reload',
		apply: 'serve',
		hotUpdate(options) {
			if (this.environment.name !== 'client') return;
			if (options.type === 'delete' || !options.file.endsWith('.po')) return;
			for (const environment of Object.values(options.server.environments)) {
				environment.moduleGraph.invalidateAll();
			}
			options.server.ws.send({ type: 'full-reload' });
			return [];
		}
	};
}

export default defineConfig({
	plugins: [
		// Not under vitest. It loads this config too, and wuchale in it extracts
		// afresh and rewrites src/locales/.wuchale/*.compiled.js with slots numbered
		// from zero — underneath a running dev server, which ignores changes to
		// those files and serves them to modules numbered against its own. Every
		// string after the first difference then rendered off by one or more: the
		// "wuchale broke again" that followed `pnpm test`. No test needs the
		// transform; a .svelte.ts module under test just keeps its English.
		...(process.env.VITEST
			? []
			: [
					// A catalog write within this many ms of wuchale's own extraction
					// counts as that extraction and is not re-read from disk. The default
					// (1000ms) also swallowed a hand-filled msgstr saved right after
					// formatting a source file; re-reading one that is wuchale's own costs
					// a recompile and nothing else.
					wuchale({ hmrDelayThreshold: 200 }),
					wuchaleCatalogReload()
				]),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},
			inspector: true,
			// Node adapter is suitable for Docker deployments.
			adapter: adapter(),
			// Kit's check also refuses a bodyless POST/DELETE that carries a bearer
			// token; `csrfHandle` in hooks.server.ts does the same check without
			// that gap (see src/lib/server/csrf.ts). Remote functions keep Kit's
			// own, stricter check, which this does not touch.
			csrf: { trustedOrigins: ['*'] },
			experimental: { remoteFunctions: true }
		})
	]
});
