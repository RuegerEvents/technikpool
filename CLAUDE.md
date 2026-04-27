# Project Overview

## What This Is

Multi-tenant equipment/asset management app. Organizations own assets and productions (events). Assets can be loaned across orgs via a request/approval workflow.

## Tech Stack

- **SvelteKit** + **Svelte 5** (runes: `$state`, `$derived`, `$props`)
- **Prisma 7** with PostgreSQL — client generated to `src/lib/prisma/`
- **Better-Auth** for email/password auth
- **Tailwind CSS 4** + **shadcn-svelte** components + **bits-ui** primitives
- **Valibot 1** for input validation in remote functions
- **svelte-sonner** for toast notifications

## Data Layer: Remote Functions

All server logic lives in `src/lib/remote/*.remote.ts`. These use SvelteKit's `query()` / `command()` from `$app/server`:

- `query(schema?, handler)` — read-only, cacheable. Call with `.refresh()` to invalidate.
- `command(schema, handler)` — mutations. Call related `query(...).refresh()` after mutating.
- `getRequestEvent()` from `$app/server` gives access to `locals.user` / `locals.session`.
- Valibot schema is the first arg (omit for no-param queries).

```ts
// Parameterized query
export const getOrg = query(v.string(), async (orgId: string) => { ... });

// Command that refreshes a parameterized query
export const createProduction = command(schema, async (data) => {
  ...
  getProductions(data.organizationId).refresh();
});
```

Auth guard pattern used in every remote file:
```ts
async function requireAuth() {
  const event = await getRequestEvent();
  if (!event?.locals.user) throw new Error('Unauthorized');
  return event.locals.user;
}
```

## Remote Files

| File | Exports |
|------|---------|
| `src/lib/remote/orgs.remote.ts` | `getMyOrgs`, `getOrg`, `getOrgUsers`, `getOrgWithMembers`, `createOrg`, `addUserToOrg`, `removeUserFromOrg`, `updateMemberRole`, `getAllUsers`, `setUserAdmin` |
| `src/lib/remote/assets.remote.ts` | `getAssets`, `getInventorySummary`, `getManufacturers`, `getProducts`, `createAssets`, `getAssetHistory`, `getBundles`, `getBundle`, `createBundle`, `addAssetToBundle`, `removeAssetFromBundle` |
| `src/lib/remote/productions.remote.ts` | `getProductions`, `getProduction`, `createProduction`, `addAssetToProduction`, `approveProductionItem`, `getPendingApprovals`, `addBundleToProduction`, `addCrewMember`, `removeCrewMember`, `getCalendarData` |

## Auth & Session

- `src/lib/server/auth.ts` — Better-Auth init + exports `prisma` client (use this everywhere, not a separate Prisma instance)
- `src/hooks.server.ts` — populates `event.locals.user` and `event.locals.session` on every request
- `src/routes/+layout.server.ts` — passes `user`, `session`, and `isAdmin` to all pages via `data`
- Auth routes: `/auth/login`, `/auth/register`
- API handler: `/api/auth/[...all]/+server.ts`

## Authorization Model

- `user.isAdmin` (DB field) — system-level admin: can manage all orgs, grant/revoke admin
- `OrgMembership.role` — per-org role: `OWNER | ADMIN | MEMBER | VIEWER`
- Org `OWNER` role = can manage that org's members
- System admins bypass org membership checks

## Route Structure

```
src/routes/
├── +layout.svelte          # App shell: nav, theme toggle, user menu
├── +layout.server.ts       # Loads user, session, isAdmin for all pages
├── +page.svelte            # Dashboard: pending approvals
├── auth/
│   ├── login/+page.svelte
│   └── register/+page.svelte
├── api/auth/[...all]/+server.ts   # Better-Auth handler
├── orgs/
│   ├── +page.svelte        # List orgs; Manage button for OWNER/admin
│   └── [id]/+page.svelte   # Manage org members: add/remove/role
├── admin/
│   └── users/+page.svelte  # System admin: grant/revoke isAdmin per user
├── inventory/
│   ├── +page.svelte        # Product catalog with stock levels
│   ├── [id]/+page.svelte   # Asset detail
│   └── new/+page.svelte    # Create assets
├── assets/
│   ├── +page.svelte        # Asset list
│   ├── new/+page.svelte
│   └── bundles/
│       ├── +page.svelte
│       ├── new/+page.svelte
│       └── [id]/+page.svelte
├── productions/
│   ├── +page.svelte
│   ├── new/+page.svelte
│   └── [id]/
│       ├── +page.svelte
│       ├── crew-passes/+page.svelte   # Print layout
│       ├── packing-list/+page.svelte  # Print layout
│       └── delivery-note/+page.svelte # Print layout
└── calendar/+page.svelte
```

Print routes (`/packing-list`, `/delivery-note`, `/crew-passes`) bypass the app header — detected via regex in `+layout.svelte`.

## UI Components

Located in `src/lib/components/ui/`: `button`, `card`, `input`, `label`, `creatable-select`, `data-view`. No shadcn `Select` component — use a native `<select>` styled with Tailwind border/input classes when needed.

## Database Schema Key Points

- `User` — `isAdmin Boolean @default(false)` for system-level admin
- `Organization` — multi-tenant root; has `defaultAssetVisibility`
- `OrgMembership` — `userId + organizationId` unique; role enum `OWNER|ADMIN|MEMBER|VIEWER`
- `Asset` — belongs to an org; can be in a `AssetBundle`
- `Production` — belongs to an org; has `ProductionItem[]` (assets) and `ProductionCrew[]` (users)
- `ProductionItem.status` — `PENDING` for cross-org requests, `APPROVED|CHECKED_OUT|RETURNED` otherwise
- `AssetTransaction` — audit log for all asset actions

---

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
