# @auraimage/cli

Command-line tool for [AuraImage](https://auraimage.ai). Sign in, pick a project, and ship images from your terminal.

## Install

```bash
# Run on demand (no install needed)
npx @auraimage/cli@latest <command>

# Or install globally
pnpm add -g @auraimage/cli
```

The binary is `aura`.

## Commands

### `aura login`

Signs in via your browser using the OAuth device flow and stores a CLI token at `~/.aura/credentials` (mode `0600`). Run once per machine.

```bash
aura login
aura login --no-browser     # Print the verification URL instead of auto-opening
aura login --force           # Replace an existing CLI session without asking
aura login --local           # Sign in against a local dev stack (auraimage.localhost)
```

### `aura init`

Picks (or creates) an AuraImage project for the current app and prints the env vars to paste into your env manager.

```bash
aura init
```

The flow:

1. If you're not signed in, `aura login` runs inline.
2. The CLI lists your projects — pick one, or choose **+ Create new project**.
3. For a new project, you'll be prompted for a name. Names must match `^[a-z0-9-]+$` (2–40 chars) and the slugified current directory name is shown as the suggestion.
4. The CLI prints a copy-pastable env block:

   ```env
   AURA_PROJECT=my-app
   AURA_SECRET_KEY=sk_live_…
   ```

   Add these to `.env.local` (Next.js / Vercel), `.env`, or your secrets manager. `AURA_SECRET_KEY` is server-side only — it signs upload tokens for the [@auraimage/sdk](https://www.npmjs.com/package/@auraimage/sdk).

`aura init` doesn't write any files for you — it just prints. That keeps the CLI out of the way of whatever env strategy your app uses.

To rotate a key, mint a new one with `aura init` (or in the dashboard), redeploy with the new value, then revoke the old key from the dashboard's Secret Keys page. Each project allows up to 10 active keys.

### `aura upload <path>`

Uploads an image, or every image under a directory, to your AuraImage project. Recurses into subdirectories, skipping dot-dirs (`.git`, `.next`, …) and `node_modules` / `dist` / `build`. Useful for migrating an existing `/public` folder.

```bash
aura upload ./hero.png                              # Single file
aura upload ./public                                 # Directory (recurses)
aura upload ./public --project-name my-app           # Explicit project
aura upload ./public --json > uploads.ndjson        # Machine-readable output
```

Options:

- `--project-name <name>` — project to upload into. If omitted, you'll get an interactive picker. Required when using `--json` (no TTY for the picker).
- `--json` — emit newline-delimited JSON to stdout (one record per file), with status messages on stderr.

Supported extensions: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`, `.bmp`, `.tiff`, `.heic`.

### `aura logout`

Revokes this CLI session server-side and clears `~/.aura/credentials`.

```bash
aura logout
```

## Environment variables

For end users, no env vars are needed — production URLs are baked in. For contributors running against a local stack:

| Variable | Default |
|---|---|
| `AURA_API_URL` | `https://api.auraimage.ai` |
| `AURA_CDN_URL` | `https://cdn.auraimage.ai` |
| `AURA_WEB_URL` | `https://auraimage.ai` |

## Documentation

Full docs: [auraimage.ai/docs](https://auraimage.ai/docs).

## License

MIT © AuraImage
