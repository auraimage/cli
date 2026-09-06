# @auraimage/cli

[![Images powered by AuraImage](https://img.shields.io/badge/Images%20powered%20by-AuraImage-0b0b0b?style=flat-square)](https://auraimage.ai)

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

## `aura og` — OG templates

An **OG template** is a design your project stores once and renders on demand into a social preview image. You author it as an HTML file in your repo, push it, and point `og:image` at the Render URL. See the [OG images guide](https://auraimage.ai/docs/og-images) for the authoring rules.

These commands authenticate with the project's **Secret Key**, not the CLI session. Set `AURA_SECRET_KEY` and `AURA_PROJECT` in `.env.local` — `aura init` prints both. Resolution order is the real environment, then `.env.local`, then `.env` in the current directory.

```sh
aura og push blog-post ./og/blog-post.html --font Inter
aura og preview ./og/blog-post.html --var title="Hello world" --out preview.png
aura og list
aura og rm blog-post
```

Canvas and font metadata are **flags, not markup** — the file stays a design, and the push carries its properties. Keep the flags in an npm script so the repo remembers them:

```json
{
  "scripts": {
    "og:push": "aura og push blog ./og/blog.html --font Inter"
  }
}
```

### `og push <name> <file>`

| Flag | Default | Notes |
|---|---|---|
| `--width <px>` | `1200` | Canvas width, 100–4096. |
| `--height <px>` | `630` | Canvas height, 100–4096. |
| `--font <family>` | none | Google Font family by name. Repeatable, max 4. Omit it to use the built-in font. |
| `--default <key=value>` | none | Default for a variable, so the Render URL may omit it. Repeatable. Splits on the first `=`, so a slot path like `cover=w=1200/blog/hero` works. |
| `--quality <n>` | `80` | 1–100, applied to JPEG and WebP only. |
| `--project <name>` | `AURA_PROJECT` | Override the project. |
| `--json` | off | Print the template summary plus `exampleUrl` as JSON. |

Push is idempotent: the same file and flags produce the same version and a `200`, and a change produces a new version that refreshes every Render URL within about a minute. On success it prints the Render URL and one example URL with every text variable filled.

### `og preview <file>`

Renders the file locally with the same engine the platform uses, so you can iterate without pushing. Image slots and static images resolve to your project's public CDN URLs and are fetched from the CDN; nothing else is fetched.

| Flag | Default | Notes |
|---|---|---|
| `--var <key=value>` | none | Value for a variable. Repeatable. |
| `--out <path>` | `og-preview.<ext>` | Where to write the image. |
| `--format <fmt>` | `png` | `png`, `jpg`, or `webp`. |
| `--width`, `--height`, `--font`, `--default`, `--quality`, `--project` | same as `push` | The canvas the preview renders at. |

A variable with no `--var` and no `--default` is an error naming the variable, the same contract the Render URL has.

### `og list` and `og rm <name>`

`og list` prints every template with its canvas, version, variables, and Render URL; `--json` prints the raw array. `og rm <name>` confirms before removing; pass `--yes` to skip the prompt (required with `--json`).

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

---

Images powered by [AuraImage](https://auraimage.ai) — the image CDN that
installs itself. Set it up in any project with `npx aura init`, or from your
AI agent with [Agent Skills](https://github.com/auraimage/skills) and the
[MCP server](https://github.com/auraimage/mcp-server).
