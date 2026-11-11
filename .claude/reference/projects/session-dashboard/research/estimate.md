---
title: Session Dashboard Estimate
type: note
permalink: projects/session-dashboard/research/estimate
tags: ["estimate", "dashboard"]
---

# Session Dashboard Estimate

Large: 900 to 1,200 production lines, 450 to 650 test lines, about 30 files. It rests on the skeleton in #24 and on
no `hub` plugin report being read yet.

| Piece | Files | Production | Tests | Notes |
|---|---|---|---|---|
| 01 Session list | `src/server/sources/agents.ts`, the stub `claude`, a fixture list | 120 to 180 | 80 to 120 | The child's timeout, kill signal, `PATH` filter and one call in flight carry the risk |
| 02 Stores | `src/server/sources/stores.ts`, fixture stores | 180 to 250 | 100 to 150 | Several files per plugin, the stat cache, last good copy and the 10 second error |
| 03 Snapshot | `src/shared/api.ts`, `src/server/hub/snapshot.ts`, `src/server/main.ts` | 150 to 220 | 120 to 160 | Which rows show and needs-you are the decisions to test |
| 04 Dashboard | `src/web/logic/*`, `src/web/ui/*`, `src/web/styles.css`, the style guide note | 400 to 550 | 120 to 200 | The browser's hand-written snapshot reader grows with `SessionView` |
| 05 Docs | the hub notes | 20 to 40 | none | |

The comparison is #24, the skeleton: 1,312 lines in `src/` and `scripts/`, of which about 400 are tests. This slice
adds two outside sources and a bigger view, and no new route.

- Risk: the browser reader for the full `SessionView` is hand-written, since no validator reaches the browser
- Not verified: the real store's shape is taken from the design's field list, not from a store file
