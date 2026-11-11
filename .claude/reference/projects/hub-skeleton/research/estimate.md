---
title: Hub Skeleton Estimate
type: note
permalink: projects/hub-skeleton/research/estimate
tags: ["estimate", "skeleton"]
---

# Hub Skeleton Estimate

Moderate to Large: 650 to 850 production lines, 300 to 450 test lines, about 120 lines of config and docs, across
about 28 files. It rests on this slice serving no session data and taking no request body.

| Piece | Files | Production | Tests | Notes |
|---|---|---|---|---|
| 01 Server shell | `src/shared/api.ts`, `src/server/http/browser.ts`, `src/server/http/assets.ts`, `src/server/main.ts`, their tests, `tsconfig.json`, `package.json`, `.gitignore`, `.prettierignore` | 300 to 400 | 200 to 300 | The request checks and headers carry most of the risk; every response kind needs them |
| 02 Browser page | `src/web/tsconfig.json`, `.oxlintrc.json`, `src/web/logic/*`, `src/web/ui/*`, `src/web/styles.css`, the icon, `package.json` | 250 to 350 | 80 to 150 | Preact under this CSP and repo's strict flags is the main unknown |
| 03 Fixture script and docs | `scripts/start-fixture-hub.sh`, `src/e2e/fixture-main.ts`, `src/e2e/tsconfig.json`, the stub `claude`, `CLAUDE.md`, the development profile, the hub notes | 60 to 100 | none | Docs move with the code |

Actual, against `main`: 828 production lines in 18 files under `src/` and `scripts/`, 400 test lines in 5 files, and
533 lines added and 55 removed in 21 config, doc and note files, 44 files in all. Production and tests landed inside
the estimate; the file count missed the knowledge base notes and this project's own files, the README, the lock file
and the CI commit.

No shipped change has this shape: the repository holds only configuration and CI so far.

- Risk: TypeScript 7's handling of `rewriteRelativeImportExtensions`, `jsx: react-jsx` and a nested project was
  measured on an unrecorded version; a gap there adds build config, not code
- Risk: oxlint's type-aware rules over `.tsx` in a nested project; a gap there adds overrides
- Not verified: Preact 11.1.1 under the CSP (11.2.0 was); the verifier's run settles it
