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
// extraction apart from an external one. That distinction turned out to be
// unreliable — formatting a source file and then filling in a translation puts
// the two milliseconds apart — and it buys nothing:
//
//   - An edit that adds or changes no string writes no .po at all, so ordinary
//     HMR never reaches this and keeps its page state.
//   - An edit that does change a string already triggers a full reload from
//     wuchale itself, so the re-transform here is the missing half rather than
//     an extra cost.
function wuchaleCatalogReload(): Plugin {
	return {
		name: 'wuchale-catalog-reload',
		apply: 'serve',
		configureServer(server) {
			const onChange = (path: string) => {
				if (!path.endsWith('.po')) return;
				server.moduleGraph.invalidateAll();
				server.ws.send({ type: 'full-reload' });
			};
			server.watcher.on('change', onChange);
			server.watcher.on('add', onChange);
		}
	};
}

export default defineConfig({
	plugins: [wuchale(), wuchaleCatalogReload(), tailwindcss(), sveltekit()]
});
