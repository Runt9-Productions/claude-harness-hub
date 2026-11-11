---
title: Hub Tests
type: note
permalink: hub/tests
tags: ["tests", "node-test", "playwright", "e2e", "fixtures"]
verified: 2026-11-11
coverage: partial
sources:
  - ".github/workflows/ci.yml"
  - "src/server/main.test.ts"
  - "scripts/start-fixture-hub.sh"
  - "src/e2e/fixture-main.ts"
  - "src/e2e/fixtures/bin/claude"
---

# Hub Tests

> **Scope.** Which kinds of test the hub has, where they live and the rules they follow, as agreed with the owner on
> 2026-11-08 and 2026-11-09 before any hub code or test existed. The `tests` job of `.github/workflows/ci.yml` was read
> for the lines that cite it. On 2026-11-11 the unit test and fixture lines were checked against the first slice's
> `src/server/main.test.ts`, fixture script and fixtures; the browser test and fake plugin lines are design the code
> does not hold yet, carried forward unchecked. Not covered: how CI's tools behave on little or nothing ([[CI Checks]]), the browser test
> job, which is not in CI yet, and Playwright's behaviour, which was not measured here.

Read this before writing or moving a test, the fixture script or `src/e2e/fixture-main.ts`.

## Observations

### Unit tests

- [invariant] `node:test` covers `src/server/hub`, `src/web/logic`, `src/server/sources` and `src/server/http`, with
  invented fixtures; `http` gets fake functions
- [invariant] A test loads `main.ts` and calls `start(config)` with a temporary config dir and asset root, so
  `node --test` needs no browser build. So far `HubConfig` has no config dir, and the asset root holds stand-in files
  (`makeAssetRoot`, `src/server/main.test.ts:28`)
- [fact] The `tests` job runs `git ls-files` over `src/**/*.test.ts` and measures coverage over `src/server/**/*.ts`
  and `src/shared/**/*.ts` only (`.github/workflows/ci.yml:198`, `.github/workflows/ci.yml:204`)
- [trap] So `src/web/logic` has no coverage threshold until both coverage globs gain `src/web/logic/**/*.ts`; that is
  an owner's change to `.github/workflows/ci.yml` #silent-failure

### Browser tests

- [invariant] `@playwright/test` with `channel: 'chrome'` and no browser download, files at `src/e2e/*.e2e.ts`, which
  CI's `src/**/*.test.ts` glob skips, typed by `src/e2e/tsconfig.json` and covered by oxlint
- [invariant] The first browser test is a smoke test under the real headers. `bypassCSP` is never set
- [invariant] A `pageerror` always fails a test, and so does a console error containing `violates`. Any other console
  error fails unless that test names the exact status line it expects, because Chrome logs every 4xx `fetch` response
  as a console error
- [question] Playwright under this CSP and Trusted Types is untried; the first browser test settles it

### Fixtures and the fake plugin

- [invariant] `scripts/start-fixture-hub.sh` copies fixtures fresh, sets `HOME` and `CLAUDE_CONFIG_DIR` to the copy,
  puts a stub `claude` first on `PATH` and runs `src/e2e/fixture-main.ts`, which calls `start` on a free port and
  prints the link. Both variables are set, or a real config dir could leak real board text into test output
- [fact] The copy comes from `src/e2e/fixtures/` into a new `mktemp -d` directory, which becomes `HOME`, with
  `CLAUDE_CONFIG_DIR` at its `.claude` and its `bin/` first on `PATH`, so both ways of finding the config dir agree.
  The fixtures so far are only the stub `claude`, which exits 1 naming its arguments
- [invariant] `fixture-main.ts` refuses to start unless `HOME` and `CLAUDE_CONFIG_DIR` are both under the temporary
  directory, so running it directly cannot reach the real config dir. It prints the link to any stdout, since the
  fixture hub serves no real data
- [fact] The script runs the hub as a child and stops it from an `EXIT` trap, with `INT` and `TERM` trapped to exit,
  so a signal to the script or its process group stops the hub and removes the copy; a `SIGKILL` to the script
  leaves both #measured (2026-11-11)
- [invariant] Fixtures are invented. Real store files and `claude agents --json --all` output hold real session
  content: read field names and counts from them, never values
- [invariant] The hub's tests fake a plugin using JSON examples from the socket contract, and the harness's tests use
  the same examples; once the harness holds them, CI's `guard` job diffs the two copies at `HARNESS_SHA`
- [trap] A probe or test that posts to the installed `board` plugin writes the real board store, which keeps only the
  newest 20 boards, so it can prune the owner's real boards #irreversible
- [invariant] Before answering from the browser ships, a throwaway real session is run through it once

## Relations

- part_of [[Hub Architecture]]
- see_also [[CI Checks]]
- see_also [[Hub Plugin Socket]]
