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
			// fetchArgs; resources.json is fetched plainly and stays current.
			fetchArgs: { cache: 'force-cache' },
			progress: (stage, current, total) => reply({ kind: 'progress', stage, current, total })
		});
		reply({ kind: 'done', result });
	} catch (error) {
		reply({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
	}
};
