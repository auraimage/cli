---
'@auraimage/cli': minor
---

`aura init` now creates a new Secret Key named `cli-<hostname>` each run (override with `--name <name>`) by POSTing to `/v1/me/secret-keys`. The `aura rotate-key` command is removed — use the dashboard to revoke unused keys.
