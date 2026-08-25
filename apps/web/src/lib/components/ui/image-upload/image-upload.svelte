<script lang="ts" module>
	// Paste is listened for on the window, because the drop zone is a button and
	// nothing here is a text field the caret could sit in. A page can hold more
	// than one uploader (the new-product modal opens over the manufacturer-logo
	// one), so exactly one of them has to claim a given paste. Ranked: the one
	// under the pointer, then the one holding focus, then the one mounted last —
	// which is the modal's, because a modal mounts over the page behind it.
	type Claimant = { hovered: () => boolean; focused: () => boolean; idle: () => boolean };

	const mounted: Claimant[] = [];

	function lastWhere(match: (c: Claimant) => boolean): Claimant | null {
		for (let i = mounted.length - 1; i >= 0; i--) if (match(mounted[i])) return mounted[i];
		return null;
	}

	function pasteClaimant(): Claimant | null {
		const idle = mounted.filter((c) => c.idle());
		if (idle.length === 0) return null;
		return (
			lastWhere((c) => c.idle() && c.hovered()) ??
			lastWhere((c) => c.idle() && c.focused()) ??
			idle[idle.length - 1]
		);
	}
</script>

<script lang="ts">
	import { getErrorMessage } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import type {
		BackgroundRemovalMessage,
		BackgroundRemovalRequest
	} from './background-removal.worker';

	let { value = $bindable(''), label = 'Image' }: { value?: string; label?: string } = $props();

	type Step = 'idle' | 'crop' | 'bg' | 'done';
	let step = $state<Step>(value ? 'done' : 'idle');

	let fileInput = $state<HTMLInputElement | null>(null);
	let container = $state<HTMLDivElement | null>(null);
	let dragOver = $state(false);
	let hovered = $state(false);

	let cropSrc = $state('');
	let naturalW = 0;
	let naturalH = 0;
	let displayImgW = $state(0);
	let displayImgH = $state(0);
	let imgOffsetX = $state(0);
	let imgOffsetY = $state(0);
	let stageSize = $state(0);

	let box = $state({ x: 0, y: 0, s: 0 });
	let drag: {
		mode: 'move' | 'resize';
		sx: number;
		sy: number;
		ox: number;
		oy: number;
		os: number;
	} | null = null;

	let containerWidth = $state(0);

	// The crop result lives on a canvas that is never in the DOM: an image that
	// already has a cut-out background skips the choice step entirely, so there
	// would be no mounted canvas to read it back from. The previews are <img>.
	let sourceImg: HTMLImageElement | null = null;
	let sourceHasAlpha = $state(false);
	let cropBackground = '#ffffff';
	let croppedCanvas: HTMLCanvasElement | null = null;
	let croppedUrl = $state('');
	let removedUrl = $state('');
	let removedBlob: Blob | null = null;

	let bgRemoving = $state(false);
	let bgRemoved = $state(false);
	let bgError = $state('');
	// imgly reports two phases: `fetch:<asset>` in bytes while the model is
	// downloaded (first use only — it is cached afterwards), then `compute:<step>`
	// counting 1..4 through the inference. They need different wording, so the
	// phase is tracked alongside the fraction. Fetch progress arrives per asset,
	// hence the record: summing them keeps the bar monotonic instead of
	// restarting at zero for each file.
	let bgPhase = $state<'' | 'fetch' | 'compute'>('');
	let bgProgress = $state(0);
	let fetchProgress: Record<string, { current: number; total: number }> = {};
	let worker: Worker | null = null;
	let uploading = $state(false);

	const checker =
		'background: repeating-conic-gradient(var(--muted) 0% 25%, var(--background) 0% 50%) 50% / 16px 16px;';

	const me: Claimant = {
		hovered: () => hovered,
		focused: () => !!container && container.contains(document.activeElement),
		idle: () => step === 'idle'
	};

	$effect(() => {
		mounted.push(me);
		return () => {
			const at = mounted.indexOf(me);
			if (at >= 0) mounted.splice(at, 1);
			worker?.terminate();
			worker = null;
			if (removedUrl) URL.revokeObjectURL(removedUrl);
		};
	});

	// A picture that already has a cut-out background has nothing to gain from
	// the removal step, so it skips straight to the upload. Sampled small,
	// because this is a yes/no about large transparent regions rather than a
	// measurement — and thresholded, so the thin band of partial alpha along an
	// anti-aliased edge doesn't read as a cut-out.
	function hasTransparency(img: HTMLImageElement): boolean {
		const side = 100;
		const probe = document.createElement('canvas');
		probe.width = side;
		probe.height = side;
		const ctx = probe.getContext('2d', { willReadFrequently: true });
		if (!ctx) return false;
		ctx.drawImage(img, 0, 0, side, side);
		let clear = 0;
		const { data } = ctx.getImageData(0, 0, side, side);
		for (let i = 3; i < data.length; i += 4) if (data[i] < 16) clear++;
		return clear / (side * side) >= 0.1;
	}

	// The colour the photo's own background is, read from its corners. A crop of
	// a photo that doesn't fill the square leaves empty bands above and below,
	// and those bands are what breaks background removal: the model works on RGB
	// and sees transparent as black, so it gets a subject framed by two black
	// bars instead of one even background, and starts cutting into the subject.
	// Painting the bands in the photo's own background instead gives it one
	// coherent background to remove — and the whole lot goes in one pass.
	function backgroundColor(img: HTMLImageElement): string {
		const side = 32;
		const probe = document.createElement('canvas');
		probe.width = side;
		probe.height = side;
		const ctx = probe.getContext('2d', { willReadFrequently: true });
		if (!ctx) return '#ffffff';
		ctx.drawImage(img, 0, 0, side, side);
		const { data } = ctx.getImageData(0, 0, side, side);
		const corners = [
			[0, 0],
			[side - 1, 0],
			[0, side - 1],
			[side - 1, side - 1]
		];
		let r = 0;
		let g = 0;
		let b = 0;
		for (const [x, y] of corners) {
			const at = (y * side + x) * 4;
			r += data[at];
			g += data[at + 1];
			b += data[at + 2];
		}
		const n = corners.length;
		return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
	}

	function canvasBlob(canvas: HTMLCanvasElement | null): Promise<Blob | null> {
		if (!canvas) return Promise.resolve(null);
		return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
	}

	function setRemovedUrl(url: string) {
		if (removedUrl) URL.revokeObjectURL(removedUrl);
		removedUrl = url;
	}

	function onFileChosen(file: File) {
		if (!file.type.startsWith('image/')) {
			toast.error('Please choose an image file');
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			cropSrc = reader.result as string;
			const img = new Image();
			img.onload = () => {
				sourceImg = img;
				naturalW = img.naturalWidth;
				naturalH = img.naturalHeight;
				sourceHasAlpha = hasTransparency(img);
				cropBackground = backgroundColor(img);

				// The stage is sized from the column the uploader actually sits in —
				// a modal is much narrower than the page. Everything inside is placed
				// in absolute pixels, so a stage wider than its container overflows
				// rather than scaling down. Minus the crop card's border and padding.
				stageSize = Math.round(Math.max(160, Math.min((containerWidth || 280) - 26, 320)));

				// The photo takes two thirds of the stage, leaving room to pull the
				// crop box out past its edges and letterbox it.
				const scale = stageSize / 1.5 / Math.max(naturalW, naturalH);
				displayImgW = naturalW * scale;
				displayImgH = naturalH * scale;
				imgOffsetX = (stageSize - displayImgW) / 2;
				imgOffsetY = (stageSize - displayImgH) / 2;

				const s = Math.max(displayImgW, displayImgH);
				box = { x: (stageSize - s) / 2, y: (stageSize - s) / 2, s };
				step = 'crop';
			};
			img.src = cropSrc;
		};
		reader.readAsDataURL(file);
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) onFileChosen(file);
	}

	function imageFromClipboard(data: DataTransfer | null): File | null {
		if (!data) return null;
		for (let i = 0; i < data.items.length; i++) {
			const item = data.items[i];
			if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
			const file = item.getAsFile();
			if (file) return file;
		}
		return null;
	}

	function handlePaste(e: ClipboardEvent) {
		if (pasteClaimant() !== me) return;
		const file = imageFromClipboard(e.clipboardData);
		if (!file) return;
		e.preventDefault();
		onFileChosen(file);
	}

	function clampBox() {
		box.s = Math.min(box.s, stageSize);
		box.x = Math.max(0, Math.min(box.x, stageSize - box.s));
		box.y = Math.max(0, Math.min(box.y, stageSize - box.s));
	}

	function startMove(e: PointerEvent) {
		drag = { mode: 'move', sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y, os: box.s };
	}
	function startResize(e: PointerEvent) {
		e.stopPropagation();
		drag = { mode: 'resize', sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y, os: box.s };
	}
	function onPointerMove(e: PointerEvent) {
		if (!drag) return;
		const dx = e.clientX - drag.sx;
		const dy = e.clientY - drag.sy;
		if (drag.mode === 'move') {
			box = { ...box, x: drag.ox + dx, y: drag.oy + dy };
		} else {
			const delta = Math.max(dx, dy);
			box = { ...box, s: Math.max(30, Math.min(stageSize, drag.os + delta)) };
		}
		clampBox();
	}
	function onPointerUp() {
		drag = null;
	}

	// Crops off-DOM, then decides whether there is a question worth asking.
	function continueToBg() {
		if (!sourceImg) return;

		const outSize = Math.round(Math.min(480, box.s * (naturalW / displayImgW)));
		const outScale = outSize / box.s;
		const canvas = document.createElement('canvas');
		canvas.width = outSize;
		canvas.height = outSize;
		const ctx = canvas.getContext('2d')!;
		// See backgroundColor(). A source that already has a cut-out background
		// skips this step entirely, so filling here can only ever cover ground the
		// photo itself doesn't reach.
		if (!sourceHasAlpha) {
			ctx.fillStyle = cropBackground;
			ctx.fillRect(0, 0, outSize, outSize);
		}
		ctx.drawImage(
			sourceImg,
			0,
			0,
			naturalW,
			naturalH,
			(imgOffsetX - box.x) * outScale,
			(imgOffsetY - box.y) * outScale,
			displayImgW * outScale,
			displayImgH * outScale
		);

		croppedCanvas = canvas;
		croppedUrl = canvas.toDataURL('image/png');
		setRemovedUrl('');
		removedBlob = null;
		bgRemoved = false;
		bgError = '';

		// Already a cut-out — there is nothing to choose between.
		if (sourceHasAlpha) {
			finish(false);
			return;
		}

		step = 'bg';
		// Started without being asked: by the time someone is on this step they
		// have already decided they want the comparison, and making them request
		// it first costs a click and a wait they could have spent watching.
		runBackgroundRemoval();
	}

	// The model is ~40 MB and is fetched from img.ly's CDN the first time anyone
	// on this browser removes a background, which is most of the wait — hence a
	// progress bar rather than a spinner. The inference runs in a worker (see
	// background-removal.worker.ts) so the page stays usable throughout.
	async function runBackgroundRemoval() {
		const source = await canvasBlob(croppedCanvas);
		if (!source) return;

		bgRemoving = true;
		bgRemoved = false;
		bgError = '';
		bgPhase = '';
		bgProgress = 0;
		fetchProgress = {};

		worker?.terminate();
		worker = new Worker(new URL('./background-removal.worker.ts', import.meta.url), {
			type: 'module'
		});

		worker.onmessage = ({ data }: MessageEvent<BackgroundRemovalMessage>) => {
			if (data.kind === 'progress') {
				if (data.stage.startsWith('compute:')) {
					bgPhase = 'compute';
					bgProgress = data.total > 0 ? Math.min(1, data.current / data.total) : 0;
				} else {
					bgPhase = 'fetch';
					fetchProgress[data.stage] = { current: data.current, total: data.total };
					let current = 0;
					let total = 0;
					for (const entry of Object.values(fetchProgress)) {
						current += entry.current;
						total += entry.total;
					}
					bgProgress = total > 0 ? Math.min(1, current / total) : 0;
				}
				return;
			}

			bgRemoving = false;
			worker?.terminate();
			worker = null;

			if (data.kind === 'error') {
				bgError = data.message;
				return;
			}
			removedBlob = data.result;
			setRemovedUrl(URL.createObjectURL(data.result));
			bgRemoved = true;
		};

		worker.onerror = (event) => {
			bgRemoving = false;
			worker?.terminate();
			worker = null;
			bgError = event.message || 'worker error';
		};

		worker.postMessage({ source } satisfies BackgroundRemovalRequest);
	}

	async function finish(useRemoved: boolean) {
		if (uploading) return;
		const blob = useRemoved ? removedBlob : await canvasBlob(croppedCanvas);
		if (!blob) return;
		uploading = true;
		try {
			const form = new FormData();
			form.append('file', blob, 'image.png');
			const response = await fetch('/api/uploads', { method: 'POST', body: form });
			if (!response.ok) {
				const error = await response.json().catch(() => ({ message: 'Upload failed' }));
				throw new Error(error.message);
			}
			const { url } = await response.json();
			value = url;
			step = 'done';
		} catch (err) {
			toast.error(getErrorMessage(err));
			// Stay where the user was, so a failed upload can be retried without
			// re-cropping. Skipping the choice step leaves nowhere to go back to.
			if (step !== 'bg') step = 'crop';
		} finally {
			uploading = false;
		}
	}

	function reset() {
		worker?.terminate();
		worker = null;
		bgRemoving = false;
		bgRemoved = false;
		bgError = '';
		croppedCanvas = null;
		croppedUrl = '';
		removedBlob = null;
		setRemovedUrl('');
		value = '';
		step = 'idle';
	}
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpaste={handlePaste} />

<div bind:this={container} bind:clientWidth={containerWidth} class="space-y-2">
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		class="hidden"
		onchange={(e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) onFileChosen(file);
		}}
	/>

	{#if step === 'idle'}
		<button
			type="button"
			onclick={() => fileInput?.click()}
			ondragover={(e) => {
				e.preventDefault();
				dragOver = true;
			}}
			ondragleave={() => (dragOver = false)}
			ondrop={handleDrop}
			onpointerenter={() => (hovered = true)}
			onpointerleave={() => (hovered = false)}
			class="w-full rounded-lg border-2 border-dashed p-6 text-center text-sm ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none {dragOver
				? 'border-primary bg-primary/5'
				: 'border-input hover:bg-muted/40'}"
		>
			Drop {label.toLowerCase()} here, paste it, or click to choose
		</button>
	{:else if step === 'crop'}
		<div class="space-y-2 rounded-lg border p-3">
			<p class="text-xs text-muted-foreground">
				Square crop. Drag to reposition, use the handle to resize — pull out to fit the whole image,
				in to crop tighter.
			</p>
			<div
				class="relative touch-none overflow-hidden rounded-md"
				style="width: {stageSize}px; height: {stageSize}px; {checker}"
			>
				<img
					src={cropSrc}
					alt=""
					class="pointer-events-none absolute"
					style="left: {imgOffsetX}px; top: {imgOffsetY}px; width: {displayImgW}px; height: {displayImgH}px;"
				/>
				<div
					role="button"
					tabindex="0"
					onpointerdown={startMove}
					class="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
					style="left: {box.x}px; top: {box.y}px; width: {box.s}px; height: {box.s}px;"
				>
					<div
						role="button"
						tabindex="0"
						onpointerdown={startResize}
						class="absolute right-[-7px] bottom-[-7px] h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-primary bg-white"
					></div>
				</div>
			</div>
			<div class="flex justify-end gap-2">
				<Button type="button" variant="outline" size="sm" onclick={reset}>Cancel</Button>
				<Button type="button" size="sm" disabled={uploading} onclick={continueToBg}>
					{#if uploading}
						Uploading…
					{:else if sourceHasAlpha}
						Use image
					{:else}
						Continue
					{/if}
				</Button>
			</div>
		</div>
	{:else if step === 'bg'}
		<div class="space-y-3 rounded-lg border p-3">
			<p class="text-xs text-muted-foreground">
				Pick one — it is uploaded straight away. The background is removed in your browser, so the
				image never leaves your device until you pick.
			</p>
			<div class="grid grid-cols-2 gap-3">
				<button
					type="button"
					disabled={uploading}
					onclick={() => finish(false)}
					class="space-y-1 rounded-md border-2 border-transparent p-1 transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none disabled:opacity-50"
				>
					<img src={croppedUrl} alt="" class="aspect-square w-full rounded" style={checker} />
					<span class="block text-[11px] text-muted-foreground">With background</span>
				</button>

				<button
					type="button"
					disabled={uploading || !bgRemoved}
					onclick={() => finish(true)}
					class="space-y-1 rounded-md border-2 border-transparent p-1 transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none disabled:opacity-50"
				>
					<span
						class="flex aspect-square w-full items-center justify-center overflow-hidden rounded"
						style={checker}
					>
						{#if removedUrl}
							<img src={removedUrl} alt="" class="h-full w-full object-contain" />
						{:else if bgError}
							<span class="px-2 text-center text-[11px] text-muted-foreground">Not possible</span>
						{/if}
					</span>
					<span class="block text-[11px] text-muted-foreground">
						{#if bgRemoving}
							{#if bgPhase === 'fetch'}
								Loading the model — {Math.round(bgProgress * 100)}%
							{:else}
								Removing…
							{/if}
						{:else if bgError}
							Background removal failed
						{:else}
							Without background
						{/if}
					</span>
				</button>
			</div>

			{#if bgRemoving}
				<div class="h-1 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full bg-primary transition-[width]"
						style="width: {Math.round(bgProgress * 100)}%"
					></div>
				</div>
			{/if}

			<div class="flex justify-between gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={uploading}
					onclick={() => (step = 'crop')}>Back</Button
				>
				{#if bgError}
					<Button type="button" variant="outline" size="sm" onclick={runBackgroundRemoval}
						>Try again</Button
					>
				{:else if uploading}
					<span class="self-center text-xs text-muted-foreground">Uploading…</span>
				{/if}
			</div>
		</div>
	{:else if step === 'done'}
		<div class="flex items-center gap-3 rounded-lg border p-2">
			<img src={value} alt="" class="h-14 w-14 rounded-md border object-cover" />
			<Button type="button" variant="outline" size="sm" onclick={reset}>Replace</Button>
		</div>
	{/if}
</div>
