---
title: Hub Skeleton Checklist
type: note
permalink: projects/hub-skeleton/checklist
tags: ["skeleton"]
---

# Hub Skeleton Checklist

## Status

- **Live item:** 03 Fixture script and docs
- **How far along:** 01 and 02 built
- **Blocked on:** nothing
- **Last moved:** 2026-11-11

## Build Order

01, 02, 03

The page needs the server to serve it, and the fixture script needs both.

## Checklist

- [x] 01 Server shell: `start(config)`, request checks, headers and CSP, the asset table, the page shell, the stub
  snapshot, the command line, and their tests
- [x] 02 Browser page: the browser build, Preact through the import map, the token flow, polling and the connection
  view, and tests for `src/web/logic`
- [ ] 03 Fixture script and docs: `scripts/start-fixture-hub.sh`, `src/e2e/fixture-main.ts`, the e2e TypeScript
  project, and the docs and notes brought in line with the code
