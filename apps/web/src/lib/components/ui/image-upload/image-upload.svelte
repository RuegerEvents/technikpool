<script lang="ts">
	import { getErrorMessage } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';

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

	let croppedCanvas = $state<HTMLCanvasElement | null>(null);
	let removedCanvas = $state<HTMLCanvasElement | null>(null);
	let cropParams = $state<{
		size: number;
		drawX: number;
		drawY: number;
		drawW: number;
		drawH: number;
	} | null>(null);
	let bgRemoving = $state(false);
	let bgRemoved = $state(false);
	let uploading = $state(false);

	const checker =
		'background: repeating-conic-gradient(var(--muted) 0% 25%, var(--background) 0% 50%) 50% / 16px 16px;';

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
				naturalW = img.naturalWidth;
				naturalH = img.naturalHeight;
				displayImgW = Math.min(280, naturalW);
				displayImgH = displayImgW * (naturalH / naturalW);
				stageSize = Math.round(Math.max(displayImgW, displayImgH) * 1.5);
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

	// Paste is listened for on the window, because the drop zone is a button and
	// nothing here is a text field the caret could sit in. A page can hold more
	// than one uploader (the new-product modal opens over the manufacturer logo
	// one), so a paste only belongs to this instance while the user is pointing
	// at this drop zone — hovering it, or having tabbed to it.
	function handlePaste(e: ClipboardEvent) {
		if (step !== 'idle') return;
		if (!hovered && !container?.contains(document.activeElement)) return;
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

	function continueToBg() {
		const outSize = Math.min(480, box.s * (naturalW / displayImgW));
		const outScale = outSize / box.s;
		cropParams = {
			size: Math.round(outSize),
			drawX: (imgOffsetX - box.x) * outScale,
			drawY: (imgOffsetY - box.y) * outScale,
			drawW: displayImgW * outScale,
			drawH: displayImgH * outScale
		};
		bgRemoved = false;
		step = 'bg';
	}

	// Runs once the 'bg' step's canvases exist in the DOM, drawing the crop
	// result into them (a fresh canvas element each time the step is entered).
	$effect(() => {
		if (step !== 'bg' || !cropParams || !croppedCanvas) return;
		const { size, drawX, drawY, drawW, drawH } = cropParams;
		const img = new Image();
		img.onload = () => {
			if (!croppedCanvas) return;
			croppedCanvas.width = size;
			croppedCanvas.height = size;
			croppedCanvas
				.getContext('2d')!
				.drawImage(img, 0, 0, naturalW, naturalH, drawX, drawY, drawW, drawH);
		};
		img.src = cropSrc;
		if (removedCanvas) {
			removedCanvas.width = size;
			removedCanvas.height = size;
		}
	});

	async function runBackgroundRemoval() {
		if (!croppedCanvas || !removedCanvas) return;
		bgRemoving = true;
		try {
			const { removeBackground } = await import('@imgly/background-removal');
			const sourceBlob: Blob = await new Promise((resolve) =>
				croppedCanvas!.toBlob((b) => resolve(b!), 'image/png')
			);
			const resultBlob = await removeBackground(sourceBlob);
			const bmp = await createImageBitmap(resultBlob);
			const ctx = removedCanvas.getContext('2d')!;
			ctx.clearRect(0, 0, removedCanvas.width, removedCanvas.height);
			ctx.drawImage(bmp, 0, 0, removedCanvas.width, removedCanvas.height);
			bgRemoved = true;
		} catch (err) {
			toast.error(`Background removal failed: ${getErrorMessage(err)}`);
		} finally {
			bgRemoving = false;
		}
	}

	async function finish(useRemoved: boolean) {
		const source = useRemoved && bgRemoved ? removedCanvas : croppedCanvas;
		if (!source) return;
		uploading = true;
		try {
			const blob: Blob = await new Promise((resolve) =>
				source.toBlob((b) => resolve(b!), 'image/png')
			);
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
		} finally {
			uploading = false;
		}
	}

	function reset() {
		value = '';
		step = 'idle';
		bgRemoved = false;
		cropParams = null;
	}
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpaste={handlePaste} />

<div bind:this={container} class="space-y-2">
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
				<Button type="button" size="sm" onclick={continueToBg}>Continue</Button>
			</div>
		</div>
	{:else if step === 'bg'}
		<div class="space-y-2 rounded-lg border p-3">
			<p class="text-xs text-muted-foreground">
				Optionally remove the background (runs in your browser — the image never leaves your device
				until you upload it).
			</p>
			<div class="flex gap-3">
				<div class="flex-1 space-y-1">
					<p class="text-[11px] text-muted-foreground">Cropped</p>
					<canvas bind:this={croppedCanvas} class="w-full rounded-md" style={checker}></canvas>
				</div>
				<div class="flex-1 space-y-1">
					<p class="text-[11px] text-muted-foreground">Background removed</p>
					<canvas bind:this={removedCanvas} class="w-full rounded-md" style={checker}></canvas>
				</div>
			</div>
			<div class="flex flex-wrap justify-end gap-2">
				<Button type="button" variant="outline" size="sm" onclick={() => (step = 'crop')}
					>Back</Button
				>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={bgRemoving}
					onclick={runBackgroundRemoval}
				>
					{bgRemoving ? 'Removing…' : 'Remove background'}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={uploading}
					onclick={() => finish(false)}
				>
					Keep background
				</Button>
				<Button
					type="button"
					size="sm"
					disabled={uploading || !bgRemoved}
					onclick={() => finish(true)}
				>
					{uploading ? 'Uploading…' : 'Use this image'}
				</Button>
			</div>
		</div>
	{:else if step === 'done'}
		<div class="flex items-center gap-3 rounded-lg border p-2">
			<img src={value} alt="" class="h-14 w-14 rounded-md border object-cover" />
			<Button type="button" variant="outline" size="sm" onclick={reset}>Replace</Button>
		</div>
	{/if}
</div>
