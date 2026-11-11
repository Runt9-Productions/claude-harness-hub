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
  counts come from them and #7 and #8 add views only (open)
- [proposal] `mode` comes from the away store alone in this slice, since no `hub` plugin reports yet; `activity`,
  `contextPercent` and `usage` stay out until #9 and #10 (open)
- [proposal] Cards are dealt into a fixed number of columns by a pure function in `src/web/logic`, in group then
  `startedAt` order, so a tall card pushes down only the cards beneath it and a card moves only when it starts or
  stops needing the owner (open)
- [proposal] The HTML and CSS style guide #6 promises is a knowledge base note, `domains/hub/style-guide.md`, holding
  the tokens and the card's structure, since a rule an agent must follow belongs where agents read (open)
- [proposal] zod 4.6.7, the newest release, which clears the 7 day rule; it has no dependencies, no `bin` and no
  install scripts (open)

## Open Questions

None.
