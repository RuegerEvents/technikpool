<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		getPairingInfo,
		approveDevice,
		denyDevice,
		getConnectedDevices,
		disconnectDevice
	} from '$lib/remote/devices.remote';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';
	import { getErrorMessage } from '$lib/utils';

	let pairing = $derived(await getPairingInfo());
	let devices = $derived(await getConnectedDevices());

	let disconnecting = $state<string | null>(null);

	async function disconnect(sessionId: string) {
		disconnecting = sessionId;
		try {
			await disconnectDevice({ sessionId });
			toast.success('Device disconnected');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			disconnecting = null;
		}
	}

	const dateFormat = new Intl.DateTimeFormat('de-DE', {
		dateStyle: 'short',
		timeStyle: 'short'
	});

	// The device flow can link straight here with the code pre-filled
	// (verification_uri_complete), so accept it from the query string.
	let userCode = $state(page.url.searchParams.get('user_code') ?? '');
	let submitting = $state(false);
	let outcome = $state<'approved' | 'denied' | null>(null);

	// Displayed in two groups of four — much easier to read off a small screen.
	let formatted = $derived(
		(() => {
			const bare = userCode.replace(/[\s-]/g, '').toUpperCase();
			return bare.length > 4 ? `${bare.slice(0, 4)}-${bare.slice(4, 8)}` : bare;
		})()
	);

	async function approve() {
		submitting = true;
		try {
			await approveDevice({ userCode });
			outcome = 'approved';
			toast.success('Device connected');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			submitting = false;
		}
	}

	async function deny() {
		submitting = true;
		try {
			await denyDevice({ userCode });
			outcome = 'denied';
			toast.success('Request rejected');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			submitting = false;
		}
	}

	function reset() {
		outcome = null;
		userCode = '';
	}
</script>

<svelte:head>
	<title>Scanners | Technikpool</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Scanners</h1>
		<p class="text-muted-foreground">
			Connect a handheld scanner to Technikpool. Scans made on a connected device are recorded under
			your name.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>1. Point the scanner at this code</Card.Title>
			<Card.Description>
				On the scanner, choose "Connect" and pull the trigger while aiming at this code. It tells
				the device where to find this server.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col items-center gap-3">
			<img
				src={resolve('/devices/qr.png')}
				alt="Server address"
				width="220"
				height="220"
				class="rounded-md border bg-white p-2"
			/>
			<code class="rounded bg-muted px-2 py-1 text-xs">{pairing.baseUrl}</code>
			<p class="text-center text-xs text-muted-foreground">
				No camera on the device? Type the address above by hand instead.
			</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>2. Enter the code the scanner shows</Card.Title>
			<Card.Description>
				The scanner displays eight characters. Enter them here to connect it. The code expires after
				15 minutes.
			</Card.Description>
		</Card.Header>
		{#if outcome === 'approved'}
			<Card.Content class="space-y-3">
				<p class="text-sm font-medium text-green-700 dark:text-green-400">
					Device connected. It can now book equipment in and out as you.
				</p>
				<Button variant="outline" onclick={reset}>Connect another device</Button>
			</Card.Content>
		{:else if outcome === 'denied'}
			<Card.Content class="space-y-3">
				<p class="text-sm font-medium text-muted-foreground">
					Request rejected. The device was not connected.
				</p>
				<Button variant="outline" onclick={reset}>Enter another code</Button>
			</Card.Content>
		{:else}
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="user-code">Code from the device</Label>
					<Input
						id="user-code"
						value={formatted}
						oninput={(e) => (userCode = e.currentTarget.value)}
						placeholder="ABCD-EFGH"
						autocomplete="off"
						spellcheck="false"
						class="font-mono text-lg tracking-widest uppercase"
					/>
				</div>
				<p class="text-xs text-muted-foreground">
					Only enter a code you are reading off a device in front of you. Anyone who gets a code
					approved gains access to your equipment.
				</p>
			</Card.Content>
			<Card.Footer class="gap-2">
				<Button onclick={approve} disabled={submitting || userCode.trim().length < 4}>
					{submitting ? 'Connecting…' : 'Connect device'}
				</Button>
				<Button
					variant="outline"
					onclick={deny}
					disabled={submitting || userCode.trim().length < 4}
				>
					Reject
				</Button>
			</Card.Footer>
		{/if}
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Connected devices</Card.Title>
			<Card.Description>
				Everything currently signed in as you. Disconnecting a device ends its session immediately —
				it has to be paired again to book anything.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if devices.length === 0}
				<p class="text-sm text-muted-foreground">No devices are connected.</p>
			{:else}
				<ul class="divide-y">
					{#each devices as device (device.id)}
						<li class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
							<span
								class="rounded-full px-2 py-0.5 text-xs font-semibold {device.kind === 'scanner'
									? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
									: 'bg-muted text-muted-foreground'}"
							>
								{device.kind === 'scanner' ? 'Scanner' : 'Browser'}
							</span>
							<div class="min-w-40 flex-1">
								<p class="text-sm font-medium">
									{device.label}
									{#if device.current}
										<span class="text-xs font-normal text-muted-foreground">· this one</span>
									{/if}
								</p>
								<p class="text-xs text-muted-foreground">
									Connected {dateFormat.format(new Date(device.connectedAt))} · last used {dateFormat.format(
										new Date(device.lastSeenAt)
									)}{#if device.ipAddress}
										· {device.ipAddress}{/if}
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={device.current || disconnecting === device.id}
								onclick={() => disconnect(device.id)}
							>
								{disconnecting === device.id ? 'Disconnecting…' : 'Disconnect'}
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
