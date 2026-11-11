---
title: Hub Architecture
type: note
permalink: hub/overview
tags: ["architecture", "modules", "imports", "typescript", "zod", "hub-plugin"]
verified: 2026-11-11
coverage: partial
sources:
  - "tsconfig.json"
  - "src/web/tsconfig.json"
  - "src/e2e/tsconfig.json"
  - ".oxlintrc.json"
  - ".github/workflows/ci.yml"
measured_on: "Node 26.13.0, TypeScript 7.0.2, oxlint 1.90.0 (versions not recorded for the 2026-11-08 lines)"
---

# Hub Architecture

> **Scope.** The hub's shape, its modules and the rules between them, as agreed with the owner on 2026-11-08 and
> 2026-11-09, before any hub code existed; `tsconfig.json` and the `tests` job of `.github/workflows/ci.yml` were read
> for the lines that cite them. On 2026-11-11, with the first slice built, the import rule and TypeScript project
> lines were checked against the three `tsconfig.json` files and `.oxlintrc.json`, with the other lines carried
> forward unchecked. The two measured lines were taken on 2026-11-08 while designing and were not re-run
> for this note. Not covered: the other areas, which have their own notes linked below, and the `hub` plugin's own
> code, which lives in runt9-claude-harness.

Read this before creating or moving a file under `src/`, adding an import between modules, or adding a schema. Lines
other than `[decision]` lines are the agent-written design the owner agreed as a whole, so a rule that blocks a
simplification can go back to the owner.

## Observations

### Shape

- [invariant] The hub is one Node process bound to `127.0.0.1` and a browser tab. It reads what `board` and `away`
  already save, runs `claude agents --json --all`, and talks to sessions only through the optional `hub` plugin over
  a private Unix socket; a command can enter only through the browser API
- [invariant] What is durable comes from the plugin stores and what is live (activity, context, usage, mode) comes
  from the `hub` plugin's reports; activity and usage are never saved
- [invariant] A session without the `hub` plugin makes no network calls and is read-only: it shows in the list with
  its saved board, and its buttons are off
- [invariant] Targets are Linux, WSL2 and macOS for the hub, and current Chrome or Edge for the page
- [decision] The hub reads saved boards from the store files, and the plugin sends only live data, because a
  stopped session has no process to report (owner, 2026-11-08)
- [invariant] The hub never substitutes a default: a `SessionView` is built only from what validated, a session
  with no board entry has empty lists, and one whose entry failed validation has an entry in `errors` that the view
  shows instead of an empty board

### Modules

| Module | Holds | May import |
|---|---|---|
| `src/shared` | One file: snapshot and browser command types, and constant lists of allowed values. No validator | Nothing |
| `src/server/hub` | Pure functions: build the snapshot, check a command, run the command queue. Time is passed in | `shared` |
| `src/server/sources` | `agents.ts`, `stores.ts`: run or read outside state, validate it, keep the last good copy | `shared`, `node:*`, `zod` |
| `src/server/http` | `browser.ts` (checks, routes), `plugin.ts` (socket routes), `assets.ts`, `body.ts` (capped JSON). Behaviour comes in as function arguments | `shared`, `node:*`, `zod` |
| `src/server/main.ts` | `start(config)` returning `{ port, token, close }`; in-memory state; wiring. Its command-line part runs only under `import.meta.main` | All server modules |
| `src/web/logic` | Pure TypeScript: reducer, grouping, ordering, which rows stay displayed, poll interval, meter colours, reading the launch link and narrowing a snapshot body. No DOM | `shared` |
| `src/web/ui` | `main.tsx`, the views, `client.ts` (polling, POST, the token) | `logic`, `shared`, `preact` |
| `src/e2e` | Browser tests, `playwright.config.ts`, `fixture-main.ts`, a fake plugin speaking the socket routes | `src/server/main.ts`, `shared`, `node:*`, `@playwright/test` |

- [invariant] `src/shared` is one runtime file, not a types-only one: the `tests` job fails any server or shared
  source no test loads, and a types-only file is erased at run time so no test can load it
  (step "node:test with coverage", `.github/workflows/ci.yml:196`)
- [invariant] `src/shared` holds no validator, so none reaches the browser bundle
- [invariant] Import rules are enforced by oxlint `no-restricted-imports` in per-directory overrides, and
  `no-restricted-globals` bars `document` and `window` in `src/web/logic`. Test files are left out of every override
- [trap] An override's patterns follow gitignore rules, where `*` stops at `/`: `!node:*` allows `node:os` but not
  `node:fs/promises`, which needs `!node:*/**` beside it #measured (2026-11-11)
- [invariant] Logic the browser needs stays in `.ts` under `src/web/logic`, because Node cannot load `.tsx` and
  `node --test` covers only what Node loads
- [fact] Import rule overrides stopped relative and `node:` imports per directory #measured (2026-11-08)

### TypeScript projects

- [invariant] Three projects: the root, with no DOM types, excluding `src/web/ui` and `src/e2e`;
  `src/web/tsconfig.json` for all of `src/web` but its tests, with DOM types and no Node types, so `logic` is checked
  by both; `src/e2e/tsconfig.json` with both type sets, emitting nothing. A `/// <reference lib="dom" />` in one e2e test would make DOM types global across the root project
- [fact] A nested `src/web/tsconfig.json` worked with `tsc` and with oxlint's type-aware rules #measured (2026-11-08)
- [fact] With `src/e2e/tsconfig.json` in place, oxlint's type-aware `no-floating-promises` fired on a file in
  `src/e2e`, as did the `e2e` import override #measured (2026-11-11)
- [invariant] The root `tsconfig.json` leaves the other two projects' directories to them (`"exclude"` at
  `tsconfig.json:24`)
- [trap] A nested project that extends the root inherits that `exclude`, resolved from the root, so it excludes its
  own directory and `tsc` stops with TS18003, no inputs found. Each nested project sets `exclude` itself
  (`src/web/tsconfig.json`, `src/e2e/tsconfig.json`) #measured (2026-11-11)
### Schemas

- [invariant] A type only the server uses is `z.infer` of its schema. A browser command has a plain type in `shared`
  and a schema in `http`, with `Exact<z.infer<typeof commandSchema>, Command>` beside the schema
- [trap] `z.ZodType<Command>` alone is not enough: it is covariant, so a schema missing an optional field compiles,
  and at run time `z.object` strips that field #silent-failure
- [invariant] Browser bodies use `z.strictObject` and `.exactOptional()`; `.optional()` conflicts with
  `exactOptionalPropertyTypes`, which the root project turns on (`tsconfig.json:14`)
- [invariant] Plugin reports and stores use `z.object`, since extra fields are allowed there
- [question] zod's `.exactOptional()`, `z.strictObject` and the two-way check were checked against its published
  types by reading, not compiled; the first schema under `tsc` settles it

## Relations

- see_also [[Hub Browser Surface]]
- see_also [[Hub Browser Code]]
- see_also [[Hub Outside State]]
- see_also [[Hub Plugin Socket]]
- see_also [[Hub Commands]]
- see_also [[Hub Tests]]
