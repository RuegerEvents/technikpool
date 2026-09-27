// Downloads the background-removal model and the onnxruntime wasm into
// static/imgly/, so browsers fetch them from this server instead of IMG.LY's
// CDN — which would hand every user's IP address to a third party the privacy
// policy would then have to name. See background-removal.worker.ts.
//
// @imgly/background-removal-data stopped being published to npm at 1.4.5, so
// the files come from the CDN once, at build time, pinned to the library's own
// version and checked against the SHA-256 the manifest lists for every chunk.
// Idempotent: a chunk already on disk with the right hash is skipped.
//
//   node scripts/fetch-imgly-assets.mjs            fails on any error (build)
//   node scripts/fetch-imgly-assets.mjs --optional warns and exits 0 (dev)

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const optional = process.argv.includes('--optional');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'static', 'imgly');

// Only what the worker asks for: the full-precision `isnet` model and the
// wasm runtime (the jsep build is the WebGPU one). The other model variants
// would add 130 MB nobody loads.
const WANTED = [
	'/models/isnet',
	'/onnxruntime-web/ort-wasm-simd-threaded.wasm',
	'/onnxruntime-web/ort-wasm-simd-threaded.mjs',
	'/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm',
	'/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs'
];

// The package's `exports` hide package.json, so find it from the entry point.
const require = createRequire(import.meta.url);
const entry = require.resolve('@imgly/background-removal');
const pkgDir = entry.slice(0, entry.lastIndexOf(`${path.sep}dist${path.sep}`));
const { version } = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
const base = `https://staticimgly.com/@imgly/background-removal-data/${version}/dist/`;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function fetchBuffer(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

async function main() {
	await mkdir(outDir, { recursive: true });
	const manifest = JSON.parse((await fetchBuffer(`${base}resources.json`)).toString('utf8'));

	const kept = {};
	const chunks = [];
	for (const key of WANTED) {
		if (!manifest[key]) throw new Error(`${key} missing from the ${version} manifest`);
		kept[key] = manifest[key];
		chunks.push(...manifest[key].chunks);
	}

	const missing = [];
	for (const chunk of chunks) {
		const file = path.join(outDir, chunk.name);
		if (existsSync(file) && sha256(await readFile(file)) === chunk.hash) continue;
		missing.push(chunk);
	}

	if (missing.length) {
		console.log(`[imgly] fetching ${missing.length} of ${chunks.length} chunks (${version})`);
	}
	// A few at a time: the model is 42 chunks of 4 MB.
	for (let i = 0; i < missing.length; i += 6) {
		await Promise.all(
			missing.slice(i, i + 6).map(async (chunk) => {
				const buf = await fetchBuffer(`${base}${chunk.name}`);
				if (sha256(buf) !== chunk.hash) throw new Error(`${chunk.name}: hash mismatch`);
				await writeFile(path.join(outDir, chunk.name), buf);
			})
		);
	}

	await writeFile(path.join(outDir, 'resources.json'), JSON.stringify(kept));
}

main().catch((err) => {
	console.error(`[imgly] ${err.message}`);
	if (optional) {
		console.warn('[imgly] background removal will not work until this succeeds');
		process.exit(0);
	}
	process.exit(1);
});
