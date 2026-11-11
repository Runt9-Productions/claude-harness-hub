---
title: Waiting List Decisions
type: note
permalink: projects/waiting-list/decisions
tags: ["waiting-list", "scope"]
---

# Waiting List Decisions

Rulings for #7. The design itself is in the hub notes under `domains/hub/`.

## Decisions

- [decision] No session sidebar in #7: it comes with #8, together with the session view its entries open, so no entry
  leads nowhere. This settles the sidebar question (owner, 2026-11-11)
- [decision] "Held in a terminal" lists every session whose `status` is `waiting`, whatever its `waitingFor`, since
  the dashboard already counts all of them as needing the owner. This settles the held-sessions question (owner,
  2026-11-11)
- [decision] Rows holding still under the pointer come with #11, together with the buttons they protect. In #7, rows
  move as items come and go. This settles the pointer question (owner, 2026-11-11)
- [decision] The hub marks each decision and owner task with `isWaiting`, from the same predicates as `waitingCount`,
  so the list and every count share one rule. This settles the waiting-rule question (owner, 2026-11-11)
- [proposal] The open row shows a decision's context and options, and an owner task's description and checklist,
  with every button and checkbox disabled and titled "Arrives in a later release", as the dashboard's controls are
  (open, 2026-11-11)
- [proposal] With no row chosen, the first row is open: the oldest decision, else the oldest task, as in the mockup
  (open, 2026-11-11)
- [proposal] An empty list keeps its heading with "(0)" and says "No decisions are waiting on you." or "No tasks are
  waiting on you.", as in the mockup (open, 2026-11-11)

- [decision] The plan in [[Waiting List Spec]] and [[Waiting List Estimate]] is approved: 4 tasks in order (owner,
  2026-11-11)
- [decision] #7's description is replaced with the issue text in [[Waiting List Spec]] (owner, 2026-11-11)
- [decision] The run may write `src/`, the fixtures and `.claude/reference/`, and may commit, push and open the draft
  pull request without asking each time (owner, 2026-11-11)

## Open Questions

None.
