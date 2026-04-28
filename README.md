# @auraimage/cli

Command-line tool for [AuraImage](https://auraimage.ai). Bootstrap a project, log in, and bulk-upload images from your terminal.

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

Authenticates against the AuraImage dashboard and saves the resulting `sk_live_…` secret to `~/.aura/credentials`. Run this once per machine.

```bash
aura login
```

### `aura init`

Initializes AuraImage for the current project: creates the project (if needed), writes the secret + project name to `.env.local`, and adds `.env.local` to `.gitignore`.

```bash
aura init
aura init --rotate    # Rotate keys only — preserves the existing projectName
```

### `aura upload <directory>`

Bulk-uploads every image under a directory to your AuraImage project. Useful for migrating an existing `/public` folder.

```bash
aura upload ./public/images --project-name my-app
aura upload ./assets --project-name my-app --json   # NDJSON output, one record per file
```

Options:
- `--project-name <name>` — required. The AuraImage project to upload into.
- `--json` — emit newline-delimited JSON (one record per uploaded file) so you can pipe the output to other tools.

## Documentation

Full docs: [auraimage.ai/docs](https://auraimage.ai/docs).

## License

MIT © AuraImage
