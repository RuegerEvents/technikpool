/// <reference lib="webworker" />
import { removeBackground } from '@imgly/background-removal';

// Background removal is ONNX inference over a ~40 MB model that is fetched on
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
			// We are the worker. Left on, imgly would nest a second one inside this.
			proxyToWorker: false,
			progress: (stage, current, total) => reply({ kind: 'progress', stage, current, total })
		});
		reply({ kind: 'done', result });
	} catch (error) {
		reply({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
	}
};
