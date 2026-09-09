# Pinned New API Web Rules

Use the existing shell components, design tokens, router, i18n, and package scripts. Do not add a dependency or duplicate a supported component/pattern without first checking the project.

## Required reading by change

Read only the relevant section of [`../docs/agent-guides/web.md`](../docs/agent-guides/web.md):

- user-visible text, locale data, or i18n constants: **3.1 Internationalization**;
- TypeScript, component structure, performance, Zustand, React Query/Axios, forms, routes, errors, styling, files, accessibility, or security: the matching **3.2–3.13** section;
- tests, test location, interaction/accessibility coverage, or validation: **3.14 Testing**;
- dependencies or build/release behavior: **3.15–3.16**.

Canvas Cloud forms, validation, localization, and tables also require [`../../docs/agent-guides/ui-form-consistency.md`](../../docs/agent-guides/ui-form-consistency.md). Its Cloud API is the business-validation source; this UI mirrors rules that can be decided locally. Read `src/features/canvas-cloud/AGENTS.md` before changing that module.

## Canvas UI iteration exception

Until the user explicitly says `complete`, a large Canvas UI task uses only a seconds-scale focused check for the changed behavior; do not run full Canvas tests, production builds, full typecheck, or the aggregate Docker gate for visual iteration. Use the workspace risk/evidence rules for visual validation timing and reuse; pure visual iterations use the user’s hot-reload review rather than a mandatory full browser matrix after each edit. For business logic, permissions, data, shared interfaces, or other high-risk contracts, run the smallest affected check promptly.

## Frozen-candidate gate

For a normal affected Web candidate, run this sole aggregate gate once from `web/`:

```bash
bash scripts/run-docker-affected-gate.sh --test <test-file>... --file <source-file>...
```

Every argument must be an existing repository-relative file and must not start with `-`. The entry uses a fixed-digest Bun base image and read-only lockfile-matched dependency image cache, requires no host Bun, and creates no persistent dependency volume. Format checking changes only a temporary copy. The gate runs focused Vitest, typecheck, affected lint, affected format, and production build in one isolated Docker container, then cleans up on success, failure and interruption and verifies zero run-owned containers/volumes remain. Do not repeat its included stages on the same candidate. Use `bash scripts/run-docker-gate.sh <command> [args...]` or `docker:gate` only for a special gate or diagnosis. Automated verification must never reuse manual-UAT Compose resources, containers, networks, databases, or volumes.
