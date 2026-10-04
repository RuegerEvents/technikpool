<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { CameraScanButton } from '#lib/components/ui/camera-scan/index.js';
	import { getErrorMessage } from '#lib/utils.js';
	import type { ScanFeedback } from './scan-feedback';

	// The scan field above every list a production is worked through: a
	// handheld types into it, the camera feeds it, and a code typed by hand
	// goes the same way. Codes are handled one after another — the camera can
	// read the next label while the last one is still on its way — and the
	// answer to the last one stays in view.

	type Props = {
		id: string;
		label: string;
		submit: (code: string) => Promise<ScanFeedback>;
		buttonLabel?: string;
	};

	let { id, label, submit, buttonLabel = 'Scan' }: Props = $props();

	let code = $state('');
	let input = $state<HTMLInputElement | null>(null);
	let feedback = $state<ScanFeedback | null>(null);
	let acting = $state(false);

	// A handheld scanner types into whatever has focus, so the field keeps it.
	$effect(() => {
		input?.focus();
	});

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		enqueue(code);
		code = '';
	}

	let queue = Promise.resolve();
	function enqueue(raw: string) {
		const value = raw.trim();
		if (value) queue = queue.then(() => run(value));
	}

	async function run(value: string) {
		try {
			feedback = await submit(value);
		} catch (err) {
			feedback = { tone: 'bad', title: getErrorMessage(err), detail: value };
		} finally {
			await tick();
			input?.focus();
		}
	}

	async function act() {
		const action = feedback?.action;
		if (!action) return;
		acting = true;
		try {
			if ((await action.run()) === false) return;
			if (feedback) feedback = { ...feedback, action: undefined };
		} catch (err) {
			feedback = { tone: 'bad', title: getErrorMessage(err) };
		} finally {
			acting = false;
			input?.focus();
		}
	}
</script>

<div class="space-y-3">
	<form class="space-y-2" onsubmit={handleSubmit}>
		<Label for={id}>{label}</Label>
		<div class="flex gap-2">
			<Input
				{id}
				bind:ref={input}
				bind:value={code}
				autocomplete="off"
				placeholder="Asset tag or serial number"
			/>
			<CameraScanButton continuous onscan={enqueue} {feedback} />
			<Button type="submit" disabled={!code.trim()}>{buttonLabel}</Button>
		</div>
	</form>
	{#if feedback}
		<div
			class="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm {feedback.tone ===
			'good'
				? 'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
				: feedback.tone === 'warn'
					? 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
					: feedback.tone === 'bad'
						? 'border-destructive/40 bg-destructive/10 text-destructive'
						: 'bg-muted/50'}"
			role="status"
		>
			<div class="min-w-0">
				<p class="font-medium">{feedback.title}</p>
				{#if feedback.detail}<p class="text-xs opacity-80">{feedback.detail}</p>{/if}
			</div>
			{#if feedback.action}
				<Button size="sm" variant="outline" disabled={acting} onclick={act}
					>{feedback.action.label}</Button
				>
			{/if}
		</div>
	{/if}
</div>
