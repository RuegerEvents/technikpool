# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.15.1 create --template minimal --types ts --add tailwindcss="plugins:none" prettier eslint --install pnpm ./
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Docker

Build and run the app locally:

```sh
docker build -t technikpool:dev .
docker run --rm -p 3000:3000 technikpool:dev
```

## Releasing

This repo includes a release helper that updates `package.json` version, commits, tags, and pushes.

```sh
pnpm release patch
pnpm release minor
pnpm release major

# or set an explicit version
pnpm release 1.2.3
```

Pushing a git tag like `v1.2.3` triggers the GitHub Action that builds and pushes a Docker Hub image tagged as `dev` and `1.2.3`.

GitHub repository configuration required for Docker Hub publishing:

- `DOCKERHUB_TOKEN` (secret): Docker Hub access token
- `DOCKERHUB_USERNAME` (secret): Docker Hub username

The workflow publishes `docker.io/hrueger/technikpool` and tags images as `dev` and the semver version (e.g. `1.2.3` for git tag `v1.2.3`).
