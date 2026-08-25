import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { wuchale } from 'wuchale/vite';

// wuchale compiles a *numeric catalog slot* into every translated string
// (`$.get(_w_runtime_)(499)`), so a component only renders correctly against the
// catalog it was transformed for. Running the `wuchale` CLI rewrites the
// catalogs from scratch and renumbers them; any component Vite has already
// transformed keeps indexing the old slots, and the page renders every string
// one or more positions off. wuchale's own HMR reloads the catalogs but not the
// modules that index into them, which is the gap this closes — the alternative
// was restarting the dev server after every extraction.
//
// Only *external* catalog writes need this. The dev server extracts on save and
// rewrites the .po files itself, and those are already consistent — reloading
// there would throw away HMR on every save. So a catalog write counts as
// external only when no source file changed just before it, which is the same
// signal wuchale uses internally to tell its own writes apart.
function wuchaleCatalogReload(): Plugin {
	const sourceSettleMs = 1500;
	let lastSourceChange = 0;

	const isSource = (file: string) =>
		/\.(svelte|ts|js)$/.test(file) && !file.includes('/src/locales/');

	return {
		name: 'wuchale-catalog-reload',
		apply: 'serve',
		configureServer(server) {
			const onChange = (path: string) => {
				const file = path.split('\\').join('/');
				if (isSource(file)) {
					lastSourceChange = Date.now();
					return;
				}
				if (!file.endsWith('.po')) return;
				if (Date.now() - lastSourceChange < sourceSettleMs) return;
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
