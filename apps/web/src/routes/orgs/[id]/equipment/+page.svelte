<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import {
		getOrgWithMembers,
		getOrgIdentityInUse,
		getNextAssetTag,
		getAssetTagSuggestion,
		resetAssetTagCounter,
		setAutoAssetTags,
		updateOrg
	} from '#lib/remote/orgs.remote.js';
	import { getInspectionTypes } from '#lib/remote/inspections.remote.js';
	import { orgIntervals } from '#lib/inspection-due.js';
	import { inspectionTypeLabel } from '#lib/inspection-ui.svelte.js';
	import { orgIdentityProblem } from '#lib/org-identity.svelte.js';
	import { confirmAction } from '#lib/confirm.svelte.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import CableColorsCard from '../cable-colors-card.svelte';
	import { orgAccess } from '../org-access.js';
	import { FormDraft } from '../form-draft.svelte.js';

	// The Equipment tab's settings: how units are numbered, how often they are
	// inspected, and the colour code on the cables. Locations and the value
	// are the tab's other sections.

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let org = $derived(orgQuery.current);
	let access = $derived(orgAccess(org, data.user?.id, !!data.isAdmin));

	// ── Asset tags ──────────────────────────────────────────────────────────
	let identityInUseQuery = $derived(getOrgIdentityInUse());
	let identityInUse = $derived((identityInUseQuery.current ?? []).filter((o) => o.id !== orgId));
	const prefixForm = new FormDraft(() => (org ? { prefix: org.assetIdPrefix } : null), {
		prefix: ''
	});
	let prefixProblem = $derived(
		org
			? orgIdentityProblem(
					{
						color: org.color,
						avatarLabel: org.avatarLabel,
						assetIdPrefix: prefixForm.value.prefix
					},
					identityInUse
				)
			: null
	);
	let savingPrefix = $state(false);

	async function savePrefix(e: Event) {
		e.preventDefault();
		if (!org || prefixProblem) return;
		savingPrefix = true;
		try {
			await updateOrg({
				orgId,
				assetIdPrefix: prefixForm.value.prefix,
				color: org.color,
				avatarLabel: org.avatarLabel
			});
			toast.success('Asset ID prefix saved');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingPrefix = false;
		}
	}

	let nextTagQuery = $derived(access.canInventory ? getNextAssetTag(orgId) : null);
	let nextTag = $derived(nextTagQuery?.current ?? null);
	// Whether the counter has run ahead of every number in use — a sticker
	// typed high, or the unit carrying it deleted since.
	let tagSuggestionQuery = $derived(access.canInventory ? getAssetTagSuggestion(orgId) : null);
	let tagSuggestion = $derived(tagSuggestionQuery?.current ?? null);
	let savingAutoTags = $state(false);

	async function toggleAutoTags(enabled: boolean) {
		savingAutoTags = true;
		try {
			await setAutoAssetTags({ orgId, enabled });
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingAutoTags = false;
		}
	}

	async function resetCounter() {
		if (!tagSuggestion) return;
		const ok = await confirmAction({
			title: `Reset the counter to ${tagSuggestion.resetTo}?`,
			description: tagSuggestion.highest
				? `The highest number a device carries is ${tagSuggestion.highest}. Numbers above it become free again, including those of deleted devices.`
				: 'No device carries a number yet. Numbering starts over, including the numbers of deleted devices.',
			confirmLabel: 'Reset'
		});
		if (!ok) return;
		savingAutoTags = true;
		try {
			await resetAssetTagCounter(orgId);
			toast.success('Counter reset');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingAutoTags = false;
		}
	}

	// ── Inspection intervals ────────────────────────────────────────────────
	// Per type, the org's own interval, else the type's default.
	let inspectionTypesQuery = $derived(getInspectionTypes());
	let inspectionTypes = $derived(inspectionTypesQuery.current ?? []);
	const intervalForm = new FormDraft<Record<string, string>>(() => {
		if (!org || !inspectionTypesQuery.ready) return null;
		const intervals = orgIntervals(inspectionTypes, org.inspectionIntervals);
		return Object.fromEntries(
			inspectionTypes.map((t) => [t.id, intervals.get(t.id)?.toString() ?? ''])
		);
	}, {});
	let savingIntervals = $state(false);

	async function saveIntervals(e: Event) {
		e.preventDefault();
		if (!org) return;
		savingIntervals = true;
		try {
			await updateOrg({
				orgId,
				assetIdPrefix: org.assetIdPrefix,
				color: org.color,
				avatarLabel: org.avatarLabel,
				inspectionIntervals: Object.fromEntries(
					inspectionTypes.map((t) => [
						t.id,
						intervalForm.value[t.id] ? Number(intervalForm.value[t.id]) : null
					])
				)
			});
			toast.success('Inspection intervals saved');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingIntervals = false;
		}
	}
</script>

<svelte:head><title>{org?.name ?? ''} | Technikpool</title></svelte:head>

{#if org}
	<div class="grid gap-6 lg:grid-cols-2">
		{#if access.canInventory}
			<Card.Root>
				<Card.Header>
					<Card.Title>Asset tags</Card.Title>
					<Card.Description>
						The numbers on your stickers: a prefix of three characters and five digits.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-5">
					{#if access.canManage}
						<form onsubmit={savePrefix} class="space-y-2">
							<Label for="prefixInput">Asset ID prefix</Label>
							<div class="flex gap-2">
								<Input
									id="prefixInput"
									bind:value={prefixForm.value.prefix}
									placeholder="123"
									maxlength={3}
									required
									class="w-24 font-mono"
								/>
								<Button
									icon="save"
									type="submit"
									variant="outline"
									disabled={!prefixForm.dirty || savingPrefix || !!prefixProblem}
								>
									{savingPrefix ? 'Saving…' : 'Save'}
								</Button>
							</div>
							{#if prefixProblem && prefixForm.dirty}
								<p class="text-xs text-destructive">{prefixProblem}</p>
							{/if}
						</form>
					{:else}
						<p class="text-sm">
							Prefix <span class="font-mono">{org.assetIdPrefix}</span>
						</p>
					{/if}
					<div class="space-y-2">
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={org.autoAssetTags}
								disabled={savingAutoTags}
								onchange={(e) => toggleAutoTags(e.currentTarget.checked)}
								class="h-4 w-4 rounded border-input"
							/>
							Number new devices automatically
						</label>
						{#if org.autoAssetTags && nextTag}
							<p class="text-xs text-muted-foreground">
								Next number: <span class="font-mono">{nextTag}</span>. A number is never handed out
								twice, even after its device is deleted.
							</p>
							{#if tagSuggestion?.counterAhead}
								<div
									class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
								>
									<span>
										{#if tagSuggestion.highest}
											The highest number in use is <span class="font-mono"
												>{tagSuggestion.highest}</span
											>
											— the counter is further ahead.
										{:else}
											No device carries a number yet, but the counter is further ahead.
										{/if}
									</span>
									<button
										type="button"
										disabled={savingAutoTags}
										onclick={resetCounter}
										class="font-medium text-foreground underline underline-offset-2 hover:no-underline disabled:opacity-50"
										>Reset counter to {tagSuggestion.resetTo}</button
									>
								</div>
							{/if}
						{:else if !org.autoAssetTags}
							<p class="text-xs text-muted-foreground">
								Off: a device gets its tag by typing or scanning the sticker.
							</p>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		{/if}

		{#if access.canManage}
			<Card.Root>
				<Card.Header>
					<Card.Title>Inspection intervals</Card.Title>
					<Card.Description>
						In months, for devices whose product needs that inspection (set per category, or on the
						product's page). A change applies to every device at once, except those with an interval
						set for their product or of their own. A device never inspected is due at once. Leave a
						type blank to not track it.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form onsubmit={saveIntervals} class="space-y-4">
						<div class="grid gap-2 sm:grid-cols-2">
							{#each intervalForm.ready ? inspectionTypes : [] as type (type.id)}
								<div class="flex items-center gap-2">
									<Input
										id="inspection-interval-{type.id}"
										inputmode="numeric"
										pattern="[0-9]*"
										value={intervalForm.value[type.id] ?? ''}
										oninput={(e) => (intervalForm.value[type.id] = e.currentTarget.value)}
										placeholder="—"
										class="w-20"
									/>
									<Label for="inspection-interval-{type.id}" class="font-normal"
										>{inspectionTypeLabel(type)}</Label
									>
								</div>
							{/each}
						</div>
						<div class="flex gap-2">
							<Button icon="save" type="submit" disabled={!intervalForm.dirty || savingIntervals}>
								{savingIntervals ? 'Saving…' : 'Save'}
							</Button>
							{#if intervalForm.dirty}
								<Button
									type="button"
									variant="outline"
									disabled={savingIntervals}
									onclick={() => intervalForm.reset()}>Discard changes</Button
								>
							{/if}
						</div>
					</form>
				</Card.Content>
			</Card.Root>
		{/if}

		<CableColorsCard {orgId} canEdit={access.canInventory} />
	</div>
{/if}
