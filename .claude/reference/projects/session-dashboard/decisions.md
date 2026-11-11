---
title: Session Dashboard Decisions
type: note
permalink: projects/session-dashboard/decisions
tags: ["dashboard", "scope"]
---

# Session Dashboard Decisions

Rulings for #6. The design itself is in the hub notes under `domains/hub/`.

## Decisions

- [decision] #6 is one pull request covering the sources, the snapshot and the dashboard, as the skeleton was (owner,
  2026-11-11)
- [decision] The dashboard is cards with "Needs you" on top, dark only on a low-saturation slate palette, modes as
  coloured text (present plain, distracted blue, away yellow), every button with a hover state, and no stretching
  when one or two sessions run; the combined mockup is the reference and real use settles the rest (owner,
  2026-11-08)
- [decision] The issue text in [[Session Dashboard Spec]] is posted as written (owner, 2026-11-11)
- [decision] The run may write `src/`, `scripts/`, `package.json` (zod through the owner's install) and
  `.claude/reference/`, and may commit, push and open the draft pull request without asking each time (owner,
  2026-11-11)
- [proposal] `SessionView` carries the design's full `decisions`, `ownerTasks` and `tasks` lists now, so the card's
  counts come from them and #7 and #8 add views only (taken, 2026-11-11)
- [proposal] `mode` comes from the away store alone in this slice, since no `hub` plugin reports yet; `activity`,
  `contextPercent` and `usage` stay out until #9 and #10 (taken, 2026-11-11)
- [proposal] Cards are dealt into a fixed number of columns by a pure function in `src/web/logic`, in group then
  `startedAt` order, so a tall card pushes down only the cards beneath it and a card moves only when it starts or
  stops needing the owner (taken, 2026-11-11) #superseded: dealing by place in the group moved every later card when
  one joined or left; replaced by the held columns below
- [proposal] The HTML and CSS style guide #6 promises is a knowledge base note, `domains/hub/style-guide.md`, holding
  the tokens and the card's structure, since a rule an agent must follow belongs where agents read (taken,
  2026-11-11)
- [proposal] zod 4.6.7, the newest release, which clears the 7 day rule; it has no dependencies, no `bin` and no
  install scripts; the owner ran the install (taken, 2026-11-11)
- [proposal] `src/server/hub/snapshot.ts` declares the input types it reads (a listed session, a stored board, a
  mode) structurally, because the import rules let `hub` import only `shared`; `main.ts` passes the sources' output,
  and `tsc` checks that it fits there (taken, 2026-11-11)
- [proposal] Task 05 corrects the outside state note: neither plugin's README lists the store fields (they are in
  `board`'s types and save code), and several fields are optional with a meaning when absent (taken, 2026-11-11)
- [proposal] `SessionView` gains `needsYou`, computed in `hub`, so the rule lives in one place for the dashboard and
  the waiting list; task 05 adds it to the browser surface note's type (taken, 2026-11-11)
- [proposal] The browser handler's snapshot function becomes async, since both sources are, and each request still
  runs them (taken, 2026-11-11)
- [proposal] Each group's columns are held in the page: a card entering a group takes the column with the fewest cards
  and keeps it until it leaves, and a new column count places every card afresh, so a card moves only when it starts
  or stops needing the owner. `placeInColumns` in `src/web/logic` is the pure placement, and `useState` in the
  `Group` view holds it, which keeps the viewport width out of the reducer (taken, 2026-11-11)
- [proposal] `SessionView` gains `waitingCount`, computed in `hub` from the same predicates as `needsYou`, and the
  browser's own count goes (taken, 2026-11-11)
- [proposal] The delivery and mode values are listed once in `src/shared/api.ts`, and the types, the store schemas
  and the page's reader are built from those lists (taken, 2026-11-11)

## Open Questions

None.
