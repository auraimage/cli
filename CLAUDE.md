# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the package directory (`packages/cli`) with pnpm:

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

- **Credentials**: stored at `~/.aura/credentials` as JSON `{ token, email }` (mode `0o600`). `aura upload` hard-exits if this file is missing — users must run `aura login` first.
- **Upload is sequential by design**: the `upload` command processes files one at a time to avoid rate limits. Do not parallelize it.
- **Upload scans top-level only**: `readdirSync` without recursion — subdirectories are not traversed.
- **`aura init`** writes `aura.config.json` and `.env.local` in the user's CWD. The outro message also instructs users to set Cloudflare Worker secrets (`MACHINE_SECRET`, `JWT_SECRET`) via `wrangler secret put` — the CLI does not manage these.

## Git Conventions

- Branch prefixes: `feature/`, `fix/`, `chore/`

## Publishing

Manual publish — no CI pipeline or changeset workflow yet:

```sh
pnpm build
pnpm publish --access public
```

Run from the `packages/cli` directory.

## No Tests Yet

`vitest.config.ts` sets `passWithNoTests: true` — there are currently no test files. The test suite always passes vacuously.
