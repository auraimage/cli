# Changesets

This directory contains changesets for `@auraimage/cli`. Every PR that changes runtime behavior should include a changeset.

```bash
pnpm exec changeset
```

The prompt picks a bump type (patch / minor / major) and a summary. On merge to `main`, a bot opens a "Version Packages" PR; merging that PR publishes the next version to npm.

See https://github.com/changesets/changesets for details.
