# Code Style Guidelines

## Svelte 5 Reactivity

**DO** use `$derived(await getData())` for async data — no manual loading state, no `onMount`, no `$effect` for fetching:
```svelte
let production = $derived(await getProduction(productionId));
let allAssets = $derived(await getAssets());
```

**DON'T** use the Svelte 4 pattern of `$state + onMount + loading flag`:
```svelte
// DON'T
let data = $state(null);
let loading = $state(true);
onMount(async () => { data = await getData(); loading = false; });
```

**DO** use `$derived` for reactive route params:
```svelte
const productionId = $derived(page.params.id as string);
```

**DON'T** re-fetch after mutations — `$derived` re-evaluates automatically. Remove manual `refreshXxx()` calls.

**DO** use `SvelteMap` instead of plain `Map` when the map is used reactively in templates.

**DO** import `page` from `$app/state`, not `$app/stores`.

## Links and Paths

**DO** wrap all internal hrefs with `resolve()` from `$app/paths`:
```svelte
import { resolve } from '$app/paths';
href={resolve('/productions')}
href={resolve(`/productions/${id}/packing-list`)}
```

**DON'T** use bare string hrefs for internal routes: `href="/productions"`.

## Prisma Queries

**DO** use `findUniqueOrThrow` instead of `findUnique` when the record must exist — avoids null-check boilerplate downstream.

## TypeScript Types

**DO** import `type { Prisma } from '@prisma/client'` and use `Prisma.XxxGetPayload<{include: ...}>` for explicit, structural types.

**DON'T** derive component-local type aliases via `NonNullable<Awaited<ReturnType<typeof fn>>>` — use Prisma payload types directly.

## Template Structure

**DO** remove outer loading/not-found guards when using `$derived(await ...)` and `findUniqueOrThrow` — the page renders once data is available:
```svelte
<div class="space-y-8">
  <h1>{production.name}</h1>
  ...
</div>
```

**DON'T** wrap the whole template in `{#if loading}...{:else if !data}...{:else}...{/if}`.

## `#each` Keys

**DO** always provide a key in `{#each}` blocks:
```svelte
{#each items as item (item.id)}
{#each users as u (u.id)}
```

**DON'T** use keyless `{#each items as item}`.

## Tailwind Class Ordering

**DO** order Tailwind classes: layout → box → typography → colors → borders → states/variants last:
```
border-b bg-background transition-colors last:border-0 hover:bg-muted/30
```

**DON'T** put variant modifiers (`last:`, `hover:`, `focus:`) before base utility classes.

## Element Formatting

**DO** put each attribute on its own line for elements with 3+ attributes, with the closing `>` on the last attribute's line (Svelte convention):
```svelte
<Button
  variant="secondary"
  href={resolve(`/productions/${id}/packing-list`)}
  target="_blank">Packing List</Button
>
```

**DON'T** put multiple attributes inline on one long line.

**DO** break long ternary class expressions across lines:
```svelte
class="px-3 py-1.5 {tab === 'assets'
  ? 'bg-primary text-primary-foreground'
  : 'bg-background hover:bg-muted'}"
```
