# @auraimage/cli

## 1.1.0

### Minor Changes

- 28ba3af: Per-project Secret Keys, project-scoped `aura init`, and richer `aura upload`.
  - `aura init` is project-scoped. It either takes `--project <name>` or shows an interactive project picker (with a **+ Create new project** option). Each run mints a fresh Secret Key named `cli-<hostname>` (overridable via `--name`) by POSTing to `/v1/projects/:projectName/secret-keys`, and prints an env block of `AURA_PROJECT=…` and `AURA_SECRET_KEY=sk_live_…` — no file writes. Set both in your env manager; `AURA_SECRET_KEY` is server-side only.
  - `aura rotate-key` is removed. The zero-downtime rotation flow is now: mint a new key with `aura init` (or in the dashboard) → redeploy → revoke the old one in the dashboard.
  - `aura upload <path>` accepts a single image file _or_ a directory. Directory mode recurses into subdirectories, skipping dot-dirs (`.git`, `.next`, …) and `node_modules` / `dist` / `build`. Uploaded filenames preserve the path relative to the upload root.
  - `--project-name` on `aura upload` is now optional: omit it for an interactive picker. Still required with `--json` (no TTY).
  - Friendlier, human-voice messages across `login`, `logout`, and `upload`.

## 1.0.1

### Patch Changes

- afd6086: Wire up changesets release pipeline so npm publishes happen on merge to main.
