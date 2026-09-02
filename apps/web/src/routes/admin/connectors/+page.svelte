<script lang="ts">
	// The connector catalogue, as an admin sees it. Rows arrive here two ways:
	// created deliberately from the picker's "create" option, or created for us
	// the first time a product names a connector nobody had catalogued. The
	// second kind is why this page exists — those rows have a guessed family and
	// no picture, and this is where they get put right.
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { Modal } from '$lib/components/ui/modal';
	import { ConnectorFormModal } from '$lib/components/ui/connector-form-modal';
	import { getConnectors, getConnectorUsage, deleteConnector } from '$lib/remote/connectors.remote';
	import { categoryLabel } from '$lib/category';
	import { CABLE_END_LABEL, connectorRole } from '$lib/cable';
	import { getErrorMessage, plural } from '$lib/utils';
	import { toast } from 'svelte-sonner';

	let connectors = $derived(await getConnectors());
	let usage = $derived(await getConnectorUsage());

	type Row = (typeof connectors)[number];

	let search = $state('');
	let trimmed = $derived(search.toLowerCase().trim());
	let visible = $derived(
		!trimmed
			? connectors
			: connectors.filter(
					(c) =>
						c.name.toLowerCase().includes(trimmed) ||
						(c.family?.toLowerCase().includes(trimmed) ?? false)
				)
	);

	// Grouped by what they mate with, because that is the thing an admin is
	// checking: whether the two ends of a pair agree on a family, and whether
	// something has landed in a family of its own by mistake.
	let families = $derived(
		Object.entries(
			visible.reduce<Record<string, Row[]>>((acc, c) => {
				const key = c.family?.trim() || c.name;
				(acc[key] ??= []).push(c);
				return acc;
			}, {})
		).sort(([a], [b]) => a.localeCompare(b, 'de'))
	);

	let editing = $state<Row | null>(null);
	let modalOpen = $state(false);
	let creating = $state(false);

	function edit(connector: Row) {
		editing = connector;
		creating = false;
		modalOpen = true;
	}

	function add() {
		editing = null;
		creating = true;
		modalOpen = true;
	}

	let deleteTarget = $state<Row | null>(null);
	let deleting = $state(false);

	async function confirmDelete() {
		if (!deleteTarget || deleting) return;
		deleting = true;
		try {
			await deleteConnector(deleteTarget.id);
			toast.success('Connector deleted');
			deleteTarget = null;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>Connectors | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Connectors</h1>
			<p class="max-w-2xl text-muted-foreground">
				What a cable's ends are called, shared by every organization. A connector nobody has
				catalogued is still accepted when equipment is registered — it turns up here afterwards,
				with its family guessed and no picture yet.
			</p>
		</div>
		<Button icon="add" onclick={add}>New connector</Button>
	</div>

	<input
		type="search"
		bind:value={search}
		placeholder="Search by name or family…"
		class="h-10 w-72 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
	/>

	{#if families.length === 0}
		<Card.Root>
			<Card.Content class="py-12 text-center text-muted-foreground">
				Nothing matches that.
			</Card.Content>
		</Card.Root>
	{:else}
		<!-- One table for the whole catalogue, with the family as a band across it
		     rather than a card of its own. A table per family sized its columns to
		     its own contents, so no two groups lined up — and the columns are
		     exactly what you read down when checking a catalogue. -->
		<div class="overflow-hidden rounded-lg border">
			<table class="w-full text-sm [&_tr:last-child]:border-0">
				<thead>
					<tr class="border-b bg-muted/40 text-left text-muted-foreground">
						<th class="w-14 px-3 py-2 font-medium"></th>
						<th class="px-3 py-2 font-medium">Name</th>
						<th class="px-3 py-2 font-medium">Body style</th>
						<th class="px-3 py-2 font-medium">Contacts</th>
						<th class="px-3 py-2 font-medium">Direction</th>
						<th class="px-3 py-2 font-medium">Department</th>
						<th class="px-3 py-2 text-right font-medium">Products</th>
						<th class="w-40 px-3 py-2"></th>
					</tr>
				</thead>
				{#each families as [family, members] (family)}
					<tbody>
						<!-- Not uppercased: the names that matter here are camel-cased
						     trademarks — powerCON, etherCON — and shouting them loses that. -->
						<tr class="border-t border-b bg-muted/60">
							<td colspan="8" class="px-3 py-2">
								<span class="font-semibold">{family}</span>
								<span class="ml-2 text-xs text-muted-foreground">
									{plural(members.length, ['# connector', '# connectors'])}
								</span>
							</td>
						</tr>
						{#each members as connector (connector.id)}
							{@const used = usage[connector.slug] ?? 0}
							<!-- Derived from the contacts plus the department's own direction —
							     never stored. Blank where gender cannot carry it: powerCON, whose
							     direction is the colour keying, and any family that is the same
							     part at both ends. -->
							{@const role = connectorRole(
								connector,
								connectors,
								connector.category?.cableInputGender
							)}
							<tr class="border-b transition-colors hover:bg-muted/30">
								<td class="px-3 py-2">
									<ProductThumb path={connector.imagePath} alt={connector.name} size={36} />
								</td>
								<td class="px-3 py-2 font-medium">{connector.name}</td>
								<td class="px-3 py-2 text-muted-foreground">
									{#if connector.form === 'plug'}
										Plug
									{:else if connector.form === 'socket'}
										Built-in socket
									{:else}
										—
									{/if}
								</td>
								<!-- Its own column rather than a suffix on the one before,
								     because on a locking connector the two disagree and that
								     is exactly what an admin is here to check. -->
								<td class="px-3 py-2 text-muted-foreground">
									{#if connector.gender === 'male'}
										Pins (male)
									{:else if connector.gender === 'female'}
										Sockets (female)
									{:else}
										—
									{/if}
								</td>
								<td class="px-3 py-2 font-mono text-xs text-muted-foreground">
									{role ? CABLE_END_LABEL[role] : '—'}
								</td>
								<td class="px-3 py-2">
									{#if connector.category}
										<CategoryPill
											name={categoryLabel(connector.category)}
											color={connector.category.color}
										/>
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</td>
								<td class="px-3 py-2 text-right font-mono tabular-nums">
									{used === 0 ? '—' : used}
								</td>
								<td class="px-3 py-2">
									<!-- Delete sits left of Edit so that Edit — the one on every row —
									     lands at the same place down the whole column. Ordering it last
									     made it jump inward on every row without a Delete. -->
									<div class="flex items-center justify-end gap-2">
										<!-- Only ever offered on a row nothing points at: the products
										     hold the *name*, so deleting a used row would not break them
										     — it would quietly drop the picture and hand the next save a
										     freshly guessed replacement. -->
										{#if used === 0}
											<Button
												icon="delete"
												variant="ghost"
												size="sm"
												onclick={() => (deleteTarget = connector)}>Delete</Button
											>
										{/if}
										<Button icon="edit" variant="outline" size="sm" onclick={() => edit(connector)}
											>Edit</Button
										>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				{/each}
			</table>
		</div>
	{/if}
</div>

<ConnectorFormModal
	bind:open={modalOpen}
	connector={creating ? null : editing}
	idPrefix="admin-connector"
/>

<Modal open={!!deleteTarget} title="Delete connector" onclose={() => (deleteTarget = null)}>
	{#snippet description()}
		No product names this connector, so nothing loses its ends — but the picture and the family go
		with it.
	{/snippet}
	{#snippet footer()}
		<Button variant="outline" onclick={() => (deleteTarget = null)}>Cancel</Button>
		<Button variant="destructive" disabled={deleting} onclick={confirmDelete}>
			{deleting ? 'Deleting…' : 'Delete'}
		</Button>
	{/snippet}
</Modal>
