---
'@auraimage/cli': minor
---

Add `aura og push`, `aura og preview`, `aura og list`, and `aura og rm` for managing a project's OG templates. They authenticate with the project's Secret Key from `AURA_SECRET_KEY`, reading `.env.local` and `.env` from the current directory, and take the canvas, fonts, defaults, and quality as flags so the template file stays a design. `aura og preview` renders locally with the same engine the platform uses, resolving image slots against the project's CDN.
