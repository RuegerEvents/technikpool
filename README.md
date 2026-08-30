# Technikpool

Multi-tenant equipment and asset management for event production. Organizations own assets and
productions; assets can be loaned across organizations through a request/approval workflow.

## Layout

pnpm workspace:

| Path           | What                                                                |
| -------------- | ------------------------------------------------------------------- |
| `apps/web`     | SvelteKit app — the web UI, the database, and the `/api/v1` surface |
| `apps/scanner` | Flutter app for Android PDA barcode scanners                        |
| `scripts`      | Release and deployment helpers                                      |

## Developing

```sh
pnpm install
docker compose up -d      # postgres + S3-compatible storage
pnpm dev                  # http://localhost:5179
```

Other scripts run from the root too: `pnpm build`, `pnpm check`, `pnpm lint`, `pnpm format`.
Anything web-specific goes through `pnpm --filter web <script>`.

Database config lives in `apps/web/.env`. Migrations:

```sh
pnpm --filter web exec prisma migrate dev
```

### Object storage

Product photos and manufacturer logos go to an S3-compatible store. `S3_ENDPOINT` and the
credentials beside it are how the _server_ reaches it; `PUBLIC_S3_URL_BASE` is how a _browser_
does, and the two differ whenever the app talks to a container name or a private address.

Only the object key (`product-images/<uuid>.png`) is stored in the database — never a full URL.
The address is built per render from `PUBLIC_S3_URL_BASE`, so moving the store is an env change
and a restart rather than a rewrite of every row. Because it is read through
`$env/dynamic/public`, that change needs no rebuild.

## API

`/api/v1` serves clients that can't use SvelteKit remote functions — chiefly the scanner app.
**`apps/web/openapi.yaml` is the contract**: the server's response types and the Dart client are
both generated from it, so an endpoint that drifts from the spec fails the build.

```sh
pnpm --filter web openapi:lint      # validate the spec
pnpm --filter web openapi:types     # regenerate server types
pnpm --filter web openapi:preview   # browsable docs
```

Clients authenticate with a bearer token, obtained either through the OAuth 2.0 device
authorization grant (a code approved at `/devices`) or by signing in with email and password.

## Scanner app

```sh
cd apps/scanner
dart run swagger_parser && dart run build_runner build   # regenerate the API client
flutter run
```

See the Flutter section of `CLAUDE.md` for how scans are read off the hardware and how to
discover a given PDA's broadcast configuration.

## Docker

The Dockerfile lives in `apps/web` but builds from the repo root, since it needs the workspace
manifest and lockfile:

```sh
docker build -f apps/web/Dockerfile -t technikpool:dev .
docker run --rm -p 3000:3000 technikpool:dev
```

## Releasing

```sh
pnpm release patch     # or minor | major | 1.2.3
```

Bumps the root `package.json`, commits, tags, and pushes. Pushing a `v1.2.3` tag triggers the
GitHub Action that publishes `docker.io/hrueger/technikpool`, tagged `dev` and the version.

Repository secrets required: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

## License

MIT — see [LICENSE](LICENSE).
