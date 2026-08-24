# Project Overview

## What This Is

Multi-tenant equipment/asset management app. Organizations own assets and productions (events). Assets can be loaned across orgs via a request/approval workflow.

## Monorepo Layout

pnpm workspace. **All paths below are relative to `apps/web/` unless stated otherwise.**

```
technikpool/
├── package.json            # root: prettier, husky, release script; delegates to workspaces
├── pnpm-workspace.yaml     # packages: apps/*
├── scripts/                # release.mjs, upgrade.sh (repo-level)
├── apps/
│   ├── web/                # the SvelteKit app — src/, prisma/, openapi.yaml, Dockerfile, .env
│   └── scanner/            # Flutter app for Android PDA barcode scanners
└── .prettierrc .prettierignore .husky/
```

Run everything from the root: `pnpm dev`, `pnpm build`, `pnpm check`, `pnpm lint`, `pnpm format`.
Anything web-specific goes through `pnpm --filter web <script>`.

The Dockerfile lives at `apps/web/Dockerfile` but its **build context is the repo root**
(it needs the workspace manifest and lockfile):
`docker build -f apps/web/Dockerfile .`

## Tech Stack

- **SvelteKit** + **Svelte 5** (runes: `$state`, `$derived`, `$props`)
- **Prisma 7** with PostgreSQL — client generated to `src/lib/prisma/`
- **Better-Auth** for email/password auth
- **Tailwind CSS 4** + **shadcn-svelte** components + **bits-ui** primitives
- **Valibot 1** for input validation in remote functions
- **svelte-sonner** for toast notifications
- **Package manager: pnpm** — always use `pnpm` (not `npm` or `yarn`)

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

| File                                   | Exports                                                                                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/remote/orgs.remote.ts`        | `getMyOrgs`, `getOrg`, `getOrgUsers`, `getOrgWithMembers`, `createOrg`, `addUserToOrg`, `removeUserFromOrg`, `updateMemberRole`, `getAllUsers`, `setUserAdmin`                                                 |
| `src/lib/remote/assets.remote.ts`      | `getAssets`, `getInventorySummary`, `getManufacturers`, `getProducts`, `createAssets`, `getAssetHistory`, `getBundles`, `getBundle`, `createBundle`, `addAssetToBundle`, `removeAssetFromBundle`               |
| `src/lib/remote/productions.remote.ts` | `getProductions`, `getProduction`, `createProduction`, `addAssetToProduction`, `approveProductionItem`, `getPendingApprovals`, `addBundleToProduction`, `addCrewMember`, `removeCrewMember`, `getCalendarData` |

## External API (`/api/v1`)

Remote functions live at hashed `/_app/remote/<hash>/<name>` URLs that change on every build,
so they cannot serve non-SvelteKit clients. Those go through `/api/v1` instead.

**`apps/web/openapi.yaml` is the contract, not documentation written afterwards.** Both sides
are generated from it:

- `pnpm --filter web openapi:types` → `src/lib/api/schema.d.ts`, which every `+server.ts`
  handler types its response against. A handler that drifts from the spec fails `pnpm check`.
- `cd apps/scanner && dart run swagger_parser && dart run build_runner build` → the Dart client.

`pnpm lint` runs `redocly lint openapi.yaml` first. `pnpm --filter web openapi:preview` serves
browsable docs; `/api/v1/openapi.json` serves the spec itself.

**MANDATORY when changing `/api/v1`:** edit `openapi.yaml` first, then regenerate both sides.

- Endpoints: `src/routes/api/v1/**/+server.ts`
- Helpers: `src/lib/server/api.ts` (`requireApiUser`, `apiError`, `handleApi`)
- Prisma → response mapping: `src/lib/server/services/api-mappers.ts`. **Never return Prisma
  payloads directly** — they carry fields the API doesn't promise, so a new column would
  silently widen every response.

## Service Layer

Logic needed by both remote functions and `/api/v1` lives in `src/lib/server/services/`:

- `access.ts` — `requireAuth`, `userOrgIds`, `isSystemAdmin`. Both surfaces scope reads through
  these so the API can never see more than the web UI.
- `checkout.ts` — `performScan`, `performBulkCheckout`. Framework-agnostic: they take a user id
  and report touched records via `affected`, and the caller decides what to invalidate
  (`query().refresh()` only means something in the remote-function layer).

## Auth & Session

- `src/lib/server/auth.ts` — Better-Auth init + exports `prisma` client (use this everywhere, not a separate Prisma instance).
  Built through a `createAuth()` factory so `auth` is typed as the _configured_ instance —
  `ReturnType<typeof betterAuth>` erases plugin endpoints like `auth.api.deviceApprove`.
  Plugins: `bearer()` (turns `Authorization: Bearer <token>` into the session cookie, which is
  why `/api/v1` endpoints need no auth code of their own) and `deviceAuthorization()` (RFC 8628,
  so a PDA can be paired without typing a password).
- `src/hooks.server.ts` — populates `event.locals.user` and `event.locals.session` on every request; also loads wuchale catalogs and sets locale per request
- `src/routes/+layout.server.ts` — passes `user`, `session`, `isAdmin`, and `locale` to all pages via `data`
- `src/routes/+layout.ts` — loads wuchale catalog on the client; re-exports all server layout data
- Auth routes: `/auth/login`, `/auth/register`
- API handler: `/api/auth/[...all]/+server.ts`

## Internationalisation (wuchale)

The app supports **German** (default) and **English** via [wuchale](https://wuchale.dev/) — a compile-time i18n toolkit.

**How it works:** wuchale extracts translatable strings at build time (no runtime key lookups). Strings in Svelte templates and `<script>` blocks are extracted automatically; variables, enums, and internal identifiers stay in English.

**Files:**

- `wuchale.config.js` — config: `locales: ['en', 'de']`, SvelteKit adapter
- `src/locales/en.po` — English source strings (auto-updated by wuchale)
- `src/locales/de.po` — German translations (edit this to add/fix translations)
- `src/locales/main.loader.svelte.js` / `main.loader.server.svelte.js` — generated loaders (do not edit)

**Locale state:** stored in the `locale` cookie (defaults to `de`). The DE/EN switcher in the header sets the cookie and reloads.

**Workflow — after adding new user-facing strings:**

```sh
npx wuchale   # extracts new strings into en.po and de.po
```

Then fill in the empty `msgstr ""` entries in `de.po`.

**MANDATORY: Never leave translations empty.** Every task that adds or changes user-facing strings MUST run `npx wuchale` and fill in all new `msgstr ""` entries in `de.po` before the task is complete.

**Extraction rules (what gets extracted):**

- All text content in Svelte markup (except inside `<style>`, `<path>`, `<code>`, `<pre>`)
- Attributes that start with an uppercase letter (e.g. `title="Profile Picture"`)
- Strings inside functions in `<script>` that start with an uppercase letter
- Strings starting with lowercase are **not** extracted — keep internal/technical strings lowercase to avoid extraction

**DO NOT** translate enum values (`OWNER`, `APPROVED`, etc.), variable names, or internal keys — wuchale won't touch them as long as they start with a lowercase letter or are not inside a function.

## Authorization Model

- `user.isAdmin` (DB field) — system-level admin: can manage all orgs, grant/revoke admin
- `OrgMembership.role` — per-org role: `OWNER | ADMIN | MEMBER | VIEWER`
- Org `OWNER` role = can manage that org's members
- System admins bypass org membership checks

## Route Structure

```
src/routes/
├── +layout.svelte          # App shell: nav, language switcher, theme toggle, user menu
├── +layout.server.ts       # Loads user, session, isAdmin, locale for all pages
├── +layout.ts              # Client-side wuchale catalog loader; re-exports server data
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
├── devices/                # Pair a handheld scanner: QR of the server URL + code entry
│   ├── +page.svelte
│   └── qr.png/+server.ts
├── api/v1/                 # External REST surface — see "External API" above
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

**MANDATORY:** When adding a new table, ensure that in auth.ts the prefix for the type id is added to the `prefixes` object passed to `extendPrismaClient` (e.g. `Production: 'prdn'`) to maintain consistent prefixed IDs across all tables.

---

# Code Style Guidelines

## Prettier

**MANDATORY:** Use Prettier for consistent code formatting. Run `npx prettier --write .` after changes to format all files. Run `npm run lint` to check for linting errors.

## Svelte 5 Reactivity

**DO** use `$derived(await getData())` for async data — no manual loading state, no `onMount`, no `$effect` for fetching:

```svelte
let production = $derived(await getProduction(productionId)); let allAssets = $derived(await
getAssets());
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
import {resolve} from '$app/paths'; href={resolve('/productions')}
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
{#each columns as col (col.key)}
{#each items as item, i (i)}   ← index key when no stable id (e.g. form row arrays)
```

**DON'T** use keyless `{#each items as item}`.

## Error Handling

**DO** omit the type annotation in catch blocks and cast when accessing `.message`:

```ts
} catch (err) {
  toast.error((err as Error).message);
}
```

**DON'T** annotate catch params with `any`: `catch (err: any)`.

## Third-party Library Type Declarations

**DO** add a file-level `/* eslint-disable @typescript-eslint/no-explicit-any */` to `.d.ts` files that declare untyped third-party modules (e.g. `src/event-calendar.d.ts`).

## Generic Svelte Components

**DO** use block-level eslint-disable/enable for rules that can't be suppressed with a single `next-line` comment (e.g. multi-line elements):

```svelte
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a href={passedThroughHref}>...</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
```

**DO** add `<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->` above the `<script>` tag for generic components that use `any` in their `generics` attribute.

## `goto()` calls

**DO** wrap all `goto()` destinations with `resolve()`:

```ts
import { resolve } from '$app/paths';
goto(resolve('/auth/login'));
goto(resolve(`/productions/${id}`));
```

**DON'T** use bare string paths: `goto('/auth/login')`.

## Tailwind Class Ordering

**DO** order Tailwind classes: layout → box → typography → colors → borders → states/variants last:

```
border-b bg-background transition-colors last:border-0 hover:bg-muted/30
```

**DON'T** put variant modifiers (`last:`, `hover:`, `focus:`) before base utility classes.

## Element Formatting

**DO** put each attribute on its own line for elements with 3+ attributes, with the closing `>` on the last attribute's line (Svelte convention):

```svelte
<Button variant="secondary" href={resolve(`/productions/${id}/packing-list`)} target="_blank"
	>Packing List</Button
>
```

**DON'T** put multiple attributes inline on one long line.

**DO** break long ternary class expressions across lines:

```svelte
class="px-3 py-1.5 {tab === 'assets'
	? 'bg-primary text-primary-foreground'
	: 'bg-background hover:bg-muted'}"
```

---

# Brand

`brand/mark.svg` is the **single master** for every icon in the repo — corner brackets
(a flightcase's corner protectors, and a scanner's viewfinder) around a T. Nothing else is
hand-drawn: `./scripts/brand.sh` regenerates all of it.

| Output                                         | Consumer                                                 |
| ---------------------------------------------- | -------------------------------------------------------- |
| `apps/web/static/favicon.svg`                  | browser tab (rounded — a tab applies no mask of its own) |
| `apps/web/static/apple-touch-icon.png`         | iOS home-screen bookmark                                 |
| `apps/scanner/assets/icon/icon.png`            | `flutter_launcher_icons` → iOS + legacy Android          |
| `apps/scanner/assets/icon/icon-foreground.png` | Android adaptive icon foreground                         |

```sh
./scripts/brand.sh                                  # from the repo root
cd apps/scanner && dart run flutter_launcher_icons  # then stamp the platform sets
```

The master is **full-bleed square** because iOS and Android apply their own corner mask; a
pre-rounded source shows transparent corners through it. To resize the mark, move the
coordinates — never `stroke-width`, since a thicker bracket reads as a different logo.

---

# Flutter Scanner App (`apps/scanner`)

Android + iOS app. It is built for warehouse PDAs (tested against a Chainway C90; Munbyn resells
the same class of hardware) and falls back to the camera on ordinary phones, so the same build
runs on a rugged handheld, an Android phone and an iPhone. German-only UI — strings in
`lib/l10n/strings.dart`, server enum labels in `lib/l10n/labels.dart`.

**The API client is generated** into `lib/api/generated/` from `apps/web/openapi.yaml`. Don't
hand-edit it; regenerate after any spec change:

```sh
cd apps/scanner
dart run swagger_parser && dart run build_runner build
```

## Scan intake

Two inputs, one path. **`ScanBus` (`lib/scan/scan_bus.dart`) is the only place a decoded barcode
enters the app**, and every screen listens to it — never to `ScanChannel.scans` directly. That is
what keeps one screen working on all three device classes without knowing which it is on, and it
is where the echo suppression lives (a trigger fires twice per pull; the camera re-reads a label
every frame).

- **Hardware** — the PDA's engine emits scans as Android broadcast Intents. `ScanReceiver.kt`
  registers a BroadcastReceiver and forwards decoded text over an EventChannel. Android only:
  `ScanChannel.isSupported` is false everywhere else and every entry point degrades to nothing
  rather than throwing MissingPluginException.
- **Camera** — `CameraScanScreen` (mobile_scanner) reads codes _into the bus_ rather than
  returning them, so a camera scan reaches the screen behind it through exactly the same path as
  a trigger pull. One-shot for pairing and lookup, continuous for a session.

**The action string and extra key are not knowable in advance** — they differ between PDA vendors
and between firmware revisions of one model. So they are configurable (Settings › Scanner-
Konfiguration), seeded with the pairs we've seen, and the Diagnose screen dumps every broadcast
received with all its extras so the real values can be read off the device. Never hardcode a guess.

Simulate a scan without hardware (works on an emulator too):

```sh
adb shell am broadcast -a com.scanner.broadcast --es data "40000001"
```

## Which input a device uses

`ScanSettings` (`lib/scan/scan_settings.dart`) resolves `ScanMode.auto` into an `effectiveMode`,
and `cameraEnabled` follows from that: a handheld with a real trigger shows **no camera UI at
all**, because a camera button there is only ever a mis-tap.

Android has **no API that answers "does this device have a barcode engine"** — the engine is a
vendor service, invisible until it broadcasts. Two signals stand in, in order of trust:

1. `hardwareSeen` — this device has actually delivered a scan (`hardwareSeenProvider`, persisted).
   Proof, and it outlives any list we maintain.
2. `DeviceIdentity.isKnownPda` — the model is one we know ships an engine: manufacturer/brand
   `sunmi` or `chainway`, or a model containing `c90`. Read over the method channel from Android's
   `Build` (no extra dependency). The C90 is matched by model as well as maker because resellers
   rebrand it — Munbyn sell the same hardware under their own name.

**The list only moves the starting answer; it is not the mechanism.** A PDA missing from it still
switches to trigger-first the moment it delivers its first scan, so a new model costs one tap,
never the feature. Anything unrecognised gets the camera. Settings › Scan-Eingabe overrides the
whole thing (Automatisch / Hardware-Auslöser / Kamera) and shows what the device reported.

`hardwareSeenProvider` is deliberately **separate from `scanModeProvider`**: it flips while a scan
is being delivered, and `scannerConfigProvider` watches the raw mode to decide whether to register
the receiver — sharing one notifier would tear the receiver down at exactly the wrong moment.

## Running against a dev server on a real device

- **Android** — `adb reverse tcp:5179 tcp:5179`, then the device reaches `http://localhost:5179`.
  Cleartext HTTP is off in release builds except for loopback, which is exactly this flow (the
  tunnel is a USB cable). Debug and profile builds override
  `res/xml/network_security_config.xml` with a permissive one, so a LAN address works there —
  use `flutter run --profile` when pointing a phone at `pnpm --filter web dev --host`.
- **iOS** — no `adb reverse` equivalent. Use the Mac's LAN address (`pnpm --filter web dev --host`).
  `NSAllowsLocalNetworking` in `ios/Runner/Info.plist` is what lets ATS allow plain HTTP to a
  private address; everything outside private ranges still requires HTTPS.
- **Both at once** — a `cloudflared`/`ngrok` tunnel. Point `PUBLIC_BETTER_AUTH_BASE_URL` at the
  tunnel URL, since device-code pairing and bearer tokens are issued against that origin.

## Gotchas

- **One platform subscription, fanned out.** `ScanChannel.scans` subscribes to the EventChannel
  once and never cancels it. `EventChannel.receiveBroadcastStream()` builds a new controller per
  call and re-fires the platform's onListen/onCancel, so subscribing per screen means the newest
  listener replaces the Kotlin sink and the first disposal clears it for everyone.
- **The home tabs live in an IndexedStack, so they all stay mounted and all hear every scan.**
  `activeTabProvider` is how a screen knows it is the one in front; without that check, scanning
  during a session also fires a lookup.
- **Typed entry does not go through `ScanBus`.** Retyping a tag by hand is deliberate, and the
  bus would swallow it as an echo.
- **iOS has no `Podfile`** — Flutter resolves the plugins through Swift Package Manager. Don't
  add one back; `flutter build ios` wires it up.
- **iOS signs with `DEVELOPMENT_TEAM = M273PG74WU`** (Hannes Rueger). `flutter create` stamps in
  whichever team Xcode used last, which is not this one — check `ios/Runner.xcodeproj` after any
  regeneration of the iOS target.
- **`flutter_launcher_icons` corrupts a build setting on every run.** It writes
  `ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = AppIcon` into
  `ios/Runner.xcodeproj/project.pbxproj`, where the value is a boolean. Set the two occurrences
  back to `YES` after running it.
- **Never run `dart format` over `lib/` wholesale.** It rewrites `lib/api/generated/`, which is
  generated from `openapi.yaml` and deliberately left unformatted. Format the files you touched.
- **`build.yaml` sets `include_if_null: false`.** Optional request fields must be _absent_ when
  unset; better-auth rejects an explicit null where it expects a string or nothing.
- **`compileSdk = 37` must be paired with `compileSdkMinor = 0`.** API 37 ships under Android's
  minor-SDK-version scheme, so the platform installs as `android-37.0`; `compileSdk` alone looks
  for `android-37` and the build fails with "Failed to find target with hash string". Needs
  AGP 9+. `minSdk` is 24, required by `flutter_secure_storage`.
- **Flutter's Gradle migration rewrites `android/app/build.gradle.kts` on build** and will revert
  hand-edited values in `defaultConfig` (it silently put `minSdk` back to `flutter.minSdkVersion`
  once). Re-check the file after a build if you changed something there.
- **Riverpod 3 wraps provider errors in `ProviderException`,** and nests them across dependent
  providers, so `unwrapError` peels those before type-checking. Any new `is ApiException` check
  must go through it or it will silently stop matching.
- **Riverpod 3 retries failed providers automatically.** The policy is set once on `ProviderScope`
  in `main.dart`: retry transport failures and 5xx, give up immediately on 4xx. Retrying a 401
  just burns battery.
- Avoid single-value enums in `openapi.yaml` — they generate unusable Dart identifiers when the
  value isn't a valid identifier (e.g. a URN). Use a documented constant string.
