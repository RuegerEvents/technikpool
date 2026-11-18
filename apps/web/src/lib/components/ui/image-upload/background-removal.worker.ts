/// <reference lib="webworker" />
import { removeBackground } from '@imgly/background-removal';

// Background removal is ONNX inference over a large model (176 MB for the
// full-precision weights we ask for, plus the ~23 MB onnxruntime wasm) fetched on
// first use. @imgly/background-removal only moves that off the main thread when
// it resolves to WebGPU (`proxyToWorker` is gated on it), so on any machine
// without WebGPU the whole thing runs inline and the tab locks up for the
// duration. Running it in a worker of our own makes that unconditional.

export type BackgroundRemovalRequest = { source: Blob };
export type BackgroundRemovalMessage =
	| { kind: 'progress'; stage: string; current: number; total: number }
	| { kind: 'done'; result: Blob }
	| { kind: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// imgly fetches every chunk of the model at once (a Promise.all over ~42 of
// them), so on a 10 Mbit/s line they share it evenly and none is finished
// until all are, two and a half minutes in. Any interruption before that, a
// closed dialog or a saved form, threw away everything, and the 42 streams
// held up every other request on the connection: a 66-byte upload answer took
// 33 s to arrive. imgly calls the global fetch, and in this worker that is
// ours, so chunks go through here instead: a few at a time, each one kept in
// Cache Storage once complete. An interrupted download then costs only the
// chunks in flight, and the next attempt picks up where it stopped. The names
// are the chunks' SHA-256, so a stored one can never be stale.
const CHUNK_PATH = /^\/imgly\/[0-9a-f]{64}\.bin$/;
const CHUNK_CACHE = 'imgly-chunks';
const MAX_PARALLEL = 4;

const networkFetch = ctx.fetch.bind(ctx);
let running = 0;
const waiting: (() => void)[] = [];

async function slot(): Promise<() => void> {
	if (running >= MAX_PARALLEL) await new Promise<void>((go) => waiting.push(go));
	running++;
	return () => {
		running--;
		waiting.shift()?.();
	};
}

// Cache Storage exists only in a secure context, so a dev server opened over
// plain http on the LAN has none; chunks are then only throttled.
async function chunkCache(): Promise<Cache | null> {
	try {
		return 'caches' in ctx ? await ctx.caches.open(CHUNK_CACHE) : null;
	} catch {
		return null;
	}
}

async function fetchChunk(url: string, init?: RequestInit): Promise<Response> {
	const cache = await chunkCache();
	const stored = await cache?.match(url).catch(() => undefined);
	if (stored) return stored;

	const release = await slot();
	try {
		const response = await networkFetch(url, init);
		if (!response.ok || !cache) return response;
		const body = await response.blob();
		// A full quota only loses the resume, not the download.
		await cache
			.put(url, new Response(body, { headers: { 'content-type': 'application/octet-stream' } }))
			.catch(() => {});
		return new Response(body, { status: response.status, headers: response.headers });
	} finally {
		release();
	}
}

/** Drop chunks of models that are no longer served, once the manifest says which are. */
async function pruneChunks(manifest: Response) {
	const cache = await chunkCache();
	if (!cache) return;
	const resources = (await manifest.json()) as Record<string, { chunks: { name: string }[] }>;
	const current = new Set(
		Object.values(resources).flatMap((entry) => entry.chunks.map((chunk) => chunk.name))
	);
	for (const request of await cache.keys()) {
		const name = new URL(request.url).pathname.split('/').pop() ?? '';
		if (!current.has(name)) await cache.delete(request);
	}
}

ctx.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = new URL(input instanceof Request ? input.url : input.toString(), ctx.location.href);
	if (url.origin === ctx.location.origin && CHUNK_PATH.test(url.pathname)) {
		return fetchChunk(url.href, init);
	}
	const response = await networkFetch(input, init);
	if (
		url.origin === ctx.location.origin &&
		url.pathname === '/imgly/resources.json' &&
		response.ok
	) {
		pruneChunks(response.clone()).catch(() => {});
	}
	return response;
};

function reply(message: BackgroundRemovalMessage) {
	ctx.postMessage(message);
}

ctx.onmessage = async (event: MessageEvent<BackgroundRemovalRequest>) => {
	try {
		const result = await removeBackground(event.data.source, {
			device: 'gpu',
			// 'isnet' is the full-precision weights; the default 'medium' is the fp16
			// build of the same net. The difference shows up exactly where product
			// shots need it — a thin handle, a cable, the sharp corner of a case —
			// and it costs a one-time 176 MB fetch instead of 88 MB, cached by the
			// browser from then on. Drop back to 'isnet_fp16' if that download is
			// ever the problem; nothing else has to change.
			model: 'isnet',
			// The matte is scaled back onto the full-size crop rather than the 1024²
			// the net ran at, so the edge keeps the crop's own resolution. On by
			// default — stated because it is the other half of feeding it WORK_SIZE.
			rescale: true,
			// We are the worker. Left on, imgly would nest a second one inside this.
			proxyToWorker: false,
			// Served by this app (scripts/fetch-imgly-assets.mjs puts them in
			// static/imgly at build). The default is IMG.LY's CDN, which would send
			// every user's IP address to a third party.
			publicPath: new URL('/imgly/', self.location.origin).href,
			// The chunks are named by their SHA-256, so a cached copy can never be
			// the wrong one. adapter-node serves static/ with no Cache-Control and an
			// ETag built from the file's mtime, which every image build resets — so
			// without this each release, and every heuristic expiry in between, sent
			// the browser back for 176 MB it already had. Only the chunks go through
			// fetchArgs; resources.json is fetched plainly and stays current. Cache
			// Storage (above) is the copy that counts; this covers a browser
			// without it and chunks fetched before it existed.
			fetchArgs: { cache: 'force-cache' },
			progress: (stage, current, total) => reply({ kind: 'progress', stage, current, total })
		});
		reply({ kind: 'done', result });
	} catch (error) {
		reply({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
	}
};
