---
title: Session Dashboard Checklist
type: note
permalink: projects/session-dashboard/checklist
tags: ["dashboard"]
---

# Session Dashboard Checklist

## Status

- **Live item:** 03 Snapshot
- **How far along:** 01 and 02 committed; 03 in progress
- **Blocked on:** nothing
- **Last moved:** 2026-11-11

## Build Order

01, 02, 03, 04, 05

Each source stands alone, the snapshot needs both, the view needs the snapshot, and the docs follow the code.

## Checklist

- [x] 01 Session list source: `src/server/sources/agents.ts`, its schema, the stub `claude` serving fixture output,
  and tests
- [x] 02 Store source: `src/server/sources/stores.ts`, the board and away schemas, fixture stores, and tests
- [ ] 03 Snapshot: the shared view types, `src/server/hub/` building `SessionView`s, `start(config)` taking the config
  dir and running the sources on each snapshot request, and tests through `start`
- [ ] 04 Dashboard view: the browser's snapshot reader, grouping and columns in `src/web/logic`, the top bar and
  cards in `src/web/ui`, the palette and card CSS, and the style guide note
- [ ] 05 Docs: the hub notes gain the new sources and close the questions this slice answers
