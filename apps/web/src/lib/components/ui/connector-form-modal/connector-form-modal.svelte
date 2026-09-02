<script lang="ts">
	// Where a cable end gets its picture. Opened from the connector pickers in
	// ProductFields and the cable batch form, on a name the catalogue has no row
	// for — so the common path is "type it, then say what it looks like", and
	// nobody is ever sent to a settings page to register a plug first.
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import {
		ConnectorFields,
		emptyConnectorDraft,
		type ConnectorDraft
	} from '$lib/components/ui/connector-fields';
	import { createConnector, updateConnector } from '$lib/remote/connectors.remote';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import type { Connector } from '$lib/prisma/client';

	type Props = {
		open: boolean;
		/** The row to edit; null creates one. */
		connector?: Connector | null;
		/** What was typed into the picker, used as the name when creating. */
		initialName?: string;
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
		onSaved?: (connector: Connector) => void;
	};

	let {
		open = $bindable(false),
		connector = null,
		initialName = '',
		idPrefix = 'connector-modal',
		onSaved
	}: Props = $props();

	let draft = $state<ConnectorDraft>(emptyConnectorDraft());
	let saving = $state(false);

	// Reseed on every open: one mounted instance serves create and edit back to
	// back, so the draft can't be trusted to still match the props.
	let seeded = $state(false);
	$effect(() => {
		if (!open) {
			seeded = false;
			return;
		}
		if (seeded) return;
		seeded = true;
		draft = connector
			? {
					name: connector.name,
					family: connector.family ?? '',
					form: (connector.form as 'plug' | 'socket' | null) ?? '',
					gender: (connector.gender as 'male' | 'female' | null) ?? '',
					categoryId: connector.categoryId ?? '',
					imagePath: connector.imagePath ?? ''
				}
			: emptyConnectorDraft(initialName);
	});

	async function save() {
		if (saving) return;
		if (!draft.name.trim()) {
			toast.error('A connector needs a name');
			return;
		}
		saving = true;
		try {
			const payload = {
				name: draft.name,
				family: draft.family || null,
				form: draft.form || null,
				gender: draft.gender || null,
				categoryId: draft.categoryId || null,
				imagePath: draft.imagePath || null
			};
			const saved = connector
				? await updateConnector({ connectorId: connector.id, ...payload })
				: await createConnector(payload);
			toast.success(connector ? 'Connector updated' : 'Connector added');
			open = false;
			onSaved?.(saved);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

<Modal bind:open title={connector ? 'Edit connector' : 'New connector'}>
	{#snippet description()}
		A picture is worth more than the name here — a connector is quicker to recognise than to read.
	{/snippet}

	<ConnectorFields bind:value={draft} {idPrefix} />

	{#snippet footer()}
		<Button icon="close" type="button" variant="outline" onclick={() => (open = false)}
			>Cancel</Button
		>
		<Button icon="add" type="button" disabled={saving} onclick={save}>
			{saving ? 'Saving…' : connector ? 'Save' : 'Add connector'}
		</Button>
	{/snippet}
</Modal>
