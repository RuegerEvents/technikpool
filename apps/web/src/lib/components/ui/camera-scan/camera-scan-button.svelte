<script lang="ts">
	// A camera button beside any field that takes an asset tag or serial number,
	// so a phone or a laptop's webcam can read the sticker where no handheld
	// scanner types it in. The code goes to `onscan`, exactly as if it had been
	// typed and submitted — the field's own logic stays the one path.
	//
	// One-shot by default: the first code closes the camera, which is what a
	// search box or a tag input wants. `continuous` keeps it open for working
	// through a shelf or a case, and shows `feedback` under the picture so the
	// answer to each scan is visible without closing it.
	import { onDestroy, onMount, tick } from 'svelte';
	import type { Html5Qrcode } from 'html5-qrcode';
	import { Camera } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { cn } from '$lib/utils';

	type Props = {
		onscan: (code: string) => void;
		continuous?: boolean;
		title?: string;
		/** A continuous scan's answer to the last code, shown under the picture. */
		feedback?: { tone: 'good' | 'warn' | 'bad' | 'info'; title: string } | null;
		disabled?: boolean;
		class?: string;
	};

	let {
		onscan,
		continuous = false,
		title = 'Scan with camera',
		feedback = null,
		disabled = false,
		class: className
	}: Props = $props();

	const elementId = `camera-scan-${Math.random().toString(36).slice(2, 9)}`;

	// No camera API outside a secure context (plain http on a LAN address), and
	// none on a desktop without a webcam driver — then there is no button either.
	let supported = $state(false);
	// After mount, so the server's render and the first client render agree.
	onMount(() => {
		supported = !!navigator.mediaDevices?.getUserMedia;
	});

	let open = $state(false);
	let failed = $state(false);
	let scanner: Html5Qrcode | null = null;
	let lastCode = '';
	let lastCodeAt = 0;

	async function start() {
		open = true;
		failed = false;
		await tick();
		try {
			const { Html5Qrcode: Lib, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode');
			// The formats our stickers and the makers' labels use — the same list
			// as the scanner app's camera.
			scanner = new Lib(elementId, {
				verbose: false,
				formatsToSupport: [F.DATA_MATRIX, F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8],
				useBarCodeDetectorIfSupported: true
			});
			await scanner.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 240, height: 160 } },
				onCode,
				() => undefined
			);
		} catch {
			scanner = null;
			failed = true;
		}
	}

	async function stop() {
		const s = scanner;
		scanner = null;
		if (s) {
			try {
				await s.stop();
			} catch {
				// Already stopped.
			}
		}
	}

	function close() {
		open = false;
		void stop();
	}

	function onCode(raw: string) {
		const code = raw.trim();
		const now = Date.now();
		// The camera reads a label on every frame it stays in view.
		if (!code || (code === lastCode && now - lastCodeAt < 3000)) return;
		lastCode = code;
		lastCodeAt = now;
		if (!continuous) close();
		onscan(code);
	}

	onDestroy(stop);
</script>

{#if supported}
	<Button
		type="button"
		variant="outline"
		size="icon"
		class={cn('shrink-0', className)}
		{disabled}
		aria-label={title}
		{title}
		onclick={start}
	>
		<Camera />
	</Button>
{/if}

<Modal bind:open {title} size="md" onclose={close}>
	{#snippet children()}
		<div class="space-y-3">
			<div id={elementId} class="overflow-hidden rounded-md bg-muted"></div>
			{#if failed}
				<p class="text-sm text-destructive">
					The camera could not be started. Allow camera access for this site, or type the code.
				</p>
			{:else}
				<p class="text-sm text-muted-foreground">Hold the label inside the frame.</p>
			{/if}
			{#if continuous && feedback}
				<div
					class="rounded-md border px-3 py-2 text-sm font-medium {feedback.tone === 'good'
						? 'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
						: feedback.tone === 'warn'
							? 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
							: feedback.tone === 'bad'
								? 'border-destructive/40 bg-destructive/10 text-destructive'
								: 'bg-muted/50'}"
					role="status"
				>
					{feedback.title}
				</div>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<Button variant="outline" onclick={close}>{continuous ? 'Done' : 'Cancel'}</Button>
	{/snippet}
</Modal>
