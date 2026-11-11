---
title: Waiting List Estimate
type: note
permalink: projects/waiting-list/research/estimate
tags: ["estimate", "waiting-list"]
---

# Waiting List Estimate

Moderate: 450 to 650 production lines, 250 to 400 test lines, about 16 files. It rests on the owner's rulings for #7:
no session sidebar, no pointer rule, and the hub marking each item as waiting. Nothing new is read from outside: the
snapshot already carries every session's full decision and owner-task lists.

| Piece | Files | Production | Tests | Notes |
|---|---|---|---|---|
| 01 `isWaiting` | `src/shared/api.ts`, `src/server/hub/snapshot.ts`, `src/web/logic/snapshot.ts` | 15 to 30 | 30 to 50 | Both predicates exist (`isUnanswered`, `isUnfinished`) |
| 02 Logic | `src/web/logic/route.ts`, `waiting.ts`, `page-state.ts` | 110 to 160 | 120 to 180 | The order's fallback and the open row's rules carry the tests |
| 03 View | `src/web/ui/page.tsx`, `waiting.tsx`, `client.ts` or `main.tsx`, `styles.css`, fixtures, the style guide note | 300 to 420 | 50 to 100 | CSS is the largest single part, as on #6 |
| 04 Docs | the hub notes | 30 to 60 | none | |

The comparison is #26's dashboard view: `src/web/` came to +996 / -67 over 7 files, of which CSS was +386. That
included the column placement, the card and the browser's snapshot reader for the whole `SessionView`. This slice
reuses the reader, the top bar and the tokens, and has no column placement, so it should come to about half.

- Risk: the launch link rewrites the hash to `#/` with `history.replaceState`, which fires no `hashchange`, so the
  route must be read again after that rewrite, or the page goes on showing the unknown route `#t=…`
- Risk: no real board writes `createdAt` yet (harness #138 to #141 add it), so every real item sorts by its
  session's start and its number, and shows no age, until then
- Not verified: how much the CSS needs for the open row; it could run to the top of the range
- Not verified: #26's notes and tests ran to twice what was estimated, mostly from the review rounds; the ranges above
  are for the build and leave that out
