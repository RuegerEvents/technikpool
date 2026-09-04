import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
		experimental: {
			async: true
		}
	},
	vitePlugin: {
		inspector: true
	},
	kit: {
		// Node adapter is suitable for Docker deployments.
		adapter: adapter(),
		experimental: {
			remoteFunctions: true
		},
		typescript: {
			config(config) {
				// Paths are relative to .svelte-kit/, where the generated tsconfig lives.
				// Without this the Prisma configs sit outside the project and TypeScript 7
				// checks them with no `types: ["node"]`, so `process` is unknown there.
				config.include.push('../prisma.config.ts', '../prisma7.config.ts');
			}
		}
	}
};

export default config;
