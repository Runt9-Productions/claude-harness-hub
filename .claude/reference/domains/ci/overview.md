---
title: CI Checks
type: note
permalink: ci/overview
tags: ["ci", "node-test", "coverage", "oxlint", "typescript"]
verified: 2026-11-08
coverage: partial
sources:
  - ".github/workflows/ci.yml"
measured_on: "Node 26.13.0, npm 11.20.0, TypeScript 7.0.2, oxlint 1.90.0, oxlint-tsgolint 7.0.2005"
---

# CI Checks

> **Scope.** How the tools `.github/workflows/ci.yml` runs behave when they have little or nothing to check, measured
> on scratch projects before the bootstrap commit. Not covered: Prettier's behaviour on an empty tree, the
> harness guard scripts and leak scan (documented in runt9-claude-harness), and zizmor.

Read this before changing a step in the `checks` or `tests` job, or a config one reads, and before reading a green
`gate` as proof that something was checked.

## Observations

- [trap] `node --test` with a glob that matches no file prints `tests 0` and exits 0, so the `tests` job counts the
  files itself #silent-failure #measured
- [trap] Coverage from `--experimental-test-coverage` lists only files some test loads; `--test-coverage-include`
  does not add unloaded ones, and a run whose only source file is unloaded reports 100% and passes the threshold
  #silent-failure #measured
- [fact] Once a test loads a file, the threshold applies to it: a file at 75% line coverage failed
  `--test-coverage-lines=95` with exit 1 #measured
- [trap] The lcov report's `SF:` lines hold paths relative to the working directory, not absolute ones #measured
- [invariant] The `tests` job's lcov check fails any non-test `.ts` file under `src/server/` or `src/shared/` that is
  missing from the report; source outside those globs is not checked and needs the step changed
- [fact] `tsc -p` on a project whose `include` matches no file exits 2 with TS18003 #measured
- [fact] oxlint exits 1 with "No files found to lint" when the path holds no file #measured
- [fact] With `--report-unused-disable-directives-severity=error`, an `oxlint-disable-next-line` that suppresses
  nothing is an error; one that does suppress something passes #measured
- [vendor] Inline `oxlint-disable` comments override the config file, and oxlint has no option that forbids them or
  requires a reason (oxlint docs, "Ignore comments", read 2026-11-07)
- [fact] `npm audit signatures` prints `N packages have verified registry signatures`; the `checks` job fails when
  that count is missing, since a run that checks no package has checked nothing #measured
- [decision] Suppressions are stopped by lint rules only, with no bespoke CI check for them (owner, 2026-11-07)
- [decision] Every server and shared source file must appear in the coverage report, checked inline in the workflow
  (owner, 2026-11-07)

## Relations

- see_also [[Hub Tests]]
