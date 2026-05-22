# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the package directory with pnpm:

```sh
pnpm build          # tsc → dist/
pnpm type-check     # tsc --noEmit
pnpm lint           # eslint "src/**/*.ts"
pnpm lint:fix       # eslint --fix "src/**/*.ts"
pnpm format         # prettier --write "src/**/*.ts"
pnpm test           # vitest run (no watch)
```

Or from the monorepo root with Turborepo filter:

```sh
pnpm build --filter=@auraimage/cli
pnpm test --filter=@auraimage/cli
```

Note: `pnpm test` also type-checks `@auraimage/config` (the local workspace dep) before running, because Turbo's `test` task declares `dependsOn: ["^type-check"]`.

## TypeScript / ESM

The package uses `"module": "NodeNext"` with `"type": "module"`. All internal imports **must use `.js` extensions** even though source files are `.ts`:

```ts
// correct
import { readConfig } from './lib/config.js';

// wrong — won't resolve at runtime
import { readConfig } from './lib/config';
```

## Code Style

- **Prettier**: `printWidth: 120`, `singleQuote: true`, `semi: true`, `trailingComma: "none"`, `tabWidth: 2`
- **Import sorting**: `@trivago/prettier-plugin-sort-imports` — third-party imports get their own group, separated by a blank line; named imports sorted alphabetically
- **TypeScript**: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` — prefix unused parameters with `_` to silence the error
- **Type imports**: prefer `import type` / inline `type` modifiers (ESLint warns on violations)
- `prettier/prettier` is treated as an ESLint **error** — always run `pnpm format` before committing

## Environment Variables

No env vars are required for end users — production URLs are baked in as defaults. For local/staging development, set these before running the CLI:

| Variable | Default |
|----------|---------|
| `AURA_API_URL` | `https://api.auraimage.ai` |
| `AURA_CDN_URL` | `https://cdn.auraimage.ai` |
| `AURA_WEB_URL` | `https://auraimage.ai` |

## Key Behaviors

- **Credentials**: stored at `~/.aura/credentials` as JSON `{ token, email, local? }` (mode `0o600`). Commands that hit the authed API hard-exit if this file is missing. `aura init` auto-triggers `aura login` inline when credentials aren't present.
- **`aura init`**: picks/creates a project via the API, creates a **new** Secret Key named `cli-<hostname>` (overridable via `--name <name>`) by POSTing to `/v1/projects/:projectName/secret-keys`, and prints a copy-pastable env block (`AURA_PROJECT`, `AURA_SECRET_KEY`). Each run mints a new key — clean up unused ones in the dashboard. `--project <name>` is optional; omit it for the interactive picker (with a **+ Create new project** option). No `aura.config.json`, no `.env.local` mutation, no wrangler guidance.
- **Project name validation** mirrors the dashboard (`apps/dashboard/src/app/dashboard/new/page.tsx`): `^[a-z0-9-]+$`, 2–40 chars, plus a reserved set (`api`, `admin`, `test`, `static`, `registry`, `cdn`, `health`, `v1`). The placeholder is the slugified `basename(process.cwd())`, falling back to `my-app` if that slug fails validation.
- **Upload is sequential by design**: `upload` processes files one at a time to avoid rate limits. Do not parallelize it.
- **Upload recurses subdirectories**: skips dot-dirs (`.git`, `.next`, …) and `node_modules` / `dist` / `build`. Honors the image-extension allow-list in `src/commands/upload.ts`.
- **`--project-name` is optional on `upload`**: omitted → interactive `p.select` picker from `GET /v1/projects`. With `--json`, the flag is required (no TTY for the picker).

## Git Conventions

- Branch prefixes: `feature/`, `fix/`, `chore/`

## Publishing

Releases are driven by [Changesets](https://github.com/changesets/changesets) and published to npm via OIDC trusted publishing from `.github/workflows/release.yml`. The flow mirrors `@auraimage/sdk` (see that repo's ADR for context).

To ship a change:

```sh
pnpm exec changeset      # pick bump type + write summary; commits a file under .changeset/
git push                 # PR lands on main → changesets bot opens a "Version Packages" PR
# Merge the Version Packages PR → release.yml publishes to npm and tags the release
```

`prepublishOnly` runs `pnpm build && pnpm test` as a safety net, so even a manual `pnpm publish` is gated by tests passing.

No `pnpm-lock.yaml` lives in this repo — CI installs with plain `pnpm install`. npm trusted-publisher must be configured on npmjs.com for repo `auraimage/cli`, workflow `release.yml`.

## No Tests Yet

`vitest.config.ts` sets `passWithNoTests: true` — there are currently no test files. The test suite always passes vacuously.
