<script lang="ts">
	// What one member is qualified to inspect in this org: per inspection type
	// that needs a qualification, the title as it goes on a protocol
	// (Elektrofachkraft, EuP, Sachkundiger) and, if it runs out, until when.
	// A blank title removes it.
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { setMemberQualification } from '#lib/remote/inspections.remote.js';
	import { inspectionTypeLabel } from '#lib/inspection-ui.svelte.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';

	type Props = {
		open: boolean;
		membershipId: string;
		memberName: string;
		types: { id: string; name: string; nameDe: string | null }[];
		current: { typeId: string; title: string; validUntil: Date | null }[];
	};

	let { open = $bindable(false), membershipId, memberName, types, current }: Props = $props();

	type Row = { title: string; validUntil: string };
	let rows = $state<Record<string, Row>>({});
	let saving = $state(false);

	const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

	$effect(() => {
		if (!open) return;
		rows = Object.fromEntries(
			types.map((t) => {
				const held = current.find((c) => c.typeId === t.id);
				return [t.id, { title: held?.title ?? '', validUntil: day(held?.validUntil ?? null) }];
			})
		);
	});

	async function save(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			for (const type of types) {
				const row = rows[type.id];
				const held = current.find((c) => c.typeId === type.id);
				const unchanged =
					(held?.title ?? '') === row.title.trim() &&
					day(held?.validUntil ?? null) === row.validUntil;
				if (unchanged) continue;
				await setMemberQualification({
					membershipId,
					typeId: type.id,
					title: row.title.trim() || null,
					validUntil: row.validUntil || null
				});
			}
			toast.success('Qualifications saved');
			open = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

<Modal bind:open title="Qualifications" dismissible={!saving}>
	{#snippet children()}
		<form id="qualification-form" class="space-y-4" onsubmit={save}>
			<p class="text-sm text-muted-foreground">
				{memberName} records inspections of a type only with a qualification for it here. Leave the title
				blank for none.
			</p>
			{#each types as type (type.id)}
				{#if rows[type.id]}
					<div class="grid gap-2 sm:grid-cols-[1fr_10rem]">
						<div class="space-y-1">
							<Label for="qual-{type.id}">{inspectionTypeLabel(type)}</Label>
							<Input
								id="qual-{type.id}"
								bind:value={rows[type.id].title}
								placeholder="e.g. Elektrofachkraft"
							/>
						</div>
						<div class="space-y-1">
							<Label for="qual-until-{type.id}">Valid until</Label>
							<Input id="qual-until-{type.id}" type="date" bind:value={rows[type.id].validUntil} />
						</div>
					</div>
				{/if}
			{/each}
		</form>
	{/snippet}
	{#snippet footer()}
		<Button icon="save" type="submit" form="qualification-form" disabled={saving}>
			{saving ? 'Saving…' : 'Save'}
		</Button>
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (open = false)}
			disabled={saving}
		>
			Cancel
		</Button>
	{/snippet}
</Modal>
