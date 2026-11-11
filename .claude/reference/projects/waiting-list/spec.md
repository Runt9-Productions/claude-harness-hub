---
title: Waiting List Spec
type: note
permalink: projects/waiting-list/spec
tags: ["waiting-list", "file-map"]
---

# Waiting List Spec

What each file in #7 holds. The rules every file follows are in [[Hub Browser Code]], [[Hub Browser Surface]],
[[Hub Outside State]] and [[Hub Style Guide]]. This map says only what this slice builds of them.

## Observations

### 01 Waiting items marked by the hub

- [invariant] `DecisionView` and `OwnerTaskView` in `src/shared/api.ts` gain `isWaiting: boolean`.
  `src/server/hub/snapshot.ts` sets it from `isUnanswered` and `isUnfinished`, the predicates `waitingCount` already
  counts with, so each session's `waitingCount` equals its number of waiting items
- [invariant] The page's reader in `src/web/logic/snapshot.ts` reads the field as required, and its test covers it
- [invariant] Snapshot tests: an answered decision and a done owner task are not waiting, and their unanswered or
  unfinished siblings are, matching `waitingCount`

### 02 Waiting list logic

- [invariant] `src/web/logic/route.ts` reads the hash into a route: `#/` or an empty hash is the dashboard,
  `#/waiting` is the waiting list, and anything else is an unknown route, which the page names instead of guessing.
  `#/session/<key>` stays unknown until #8
- [invariant] `src/web/logic/waiting.ts` collects every waiting item across sessions into two lists, decisions and
  owner tasks, each row keyed `<session key>/<kind>/<item id>` and naming its session (its name, else short id, else
  key, as the card does). Each list sorts oldest first: by `createdAt`, and an item without one by its session's
  `startedAt`, then by the number in its id (`D12` is 12), then by id. An item with `createdAt` sorts before one
  without at an equal time
- [invariant] It also lists the held sessions, those whose `status` is `waiting`, in `startedAt` order, with their
  `waitingFor` text. They are not rows and add nothing to the count
- [invariant] The open row is page UI state in `src/web/logic/page-state.ts`, which a new snapshot never touches. The
  open row is the chosen key while that row is listed. With nothing chosen, or once the chosen row has left, the
  first row is open: the oldest decision, else the oldest task. Opening a row closes the other one, and pressing the
  open row's header closes it and leaves none open
- [invariant] The age shown on a row comes from `createdAt` and the snapshot's `now`, in whole minutes, then hours
  past an hour and days past a day. A row without `createdAt` shows no age
- [invariant] Each rule above is a pure function with `node:test` tests

### 03 Waiting list view

- [invariant] The top bar's switcher becomes two links, `#/` and `#/waiting`, with `aria-current` on the current
  view. "Everything waiting" carries the sum of every session's `waitingCount` in an amber count (C4). The page
  follows `hashchange`
- [invariant] `src/web/ui/waiting.tsx` draws two columns side by side, "Decisions, oldest first (N)" and "Tasks,
  oldest first (N)", which stack under 1000 px. Each collapsed row is one button with `aria-expanded`, showing the
  session name, the title cut to one line, and the age. The Tasks column puts the session name above the title
- [invariant] An open decision shows its context and its options in board order, the recommended one marked
  "(recommended)", with Dismiss. An open owner task shows its description, its checklist as checkboxes, and Start
  and Done. Every control is disabled and titled "Arrives in a later release"
- [invariant] An item whose session has no process says "process stopped: `claude attach <id>` wakes it", as the
  card does
- [invariant] "Held in a terminal" sits under the decisions and is absent when no session is held. One line per
  session: "<name> is waiting on <waitingFor>. Answer it in its terminal.", or "<name> is waiting. Answer it in its
  terminal." when `waitingFor` is absent
- [invariant] An empty list keeps its heading with "(0)" and says "No decisions are waiting on you." or "No tasks are
  waiting on you.". An unknown route says so, with a link to the dashboard
- [invariant] Board text is rendered as text. Source errors show under the top bar as on the dashboard
- [invariant] `src/web/styles.css` gains the row, open row, column and held-line rules from the style guide's tokens,
  and the style guide note gains the waiting list's parts
- [invariant] The fixtures gain what the view needs to be seen: items with and without `createdAt` across two
  sessions, an owner task with a description and a checklist, and a decision with context and a recommended option,
  all invented

### 04 Docs

- [invariant] [[Hub Browser Code]] gains the route and the waiting list's state, [[Hub Browser Surface]] gains
  `isWaiting`, and [[Hub Outside State]] notes that the waiting-items order is now built

### Follow-ups outside this pull request

- [invariant] #11 gains "rows hold still under the pointer" when it is brought in line with the design, since #7
  leaves it there

## Issue text

To replace #7's description once approved:

---

## Objective

Show one place holding every unanswered decision and unfinished owner task across sessions, so the owner can work
through them one at a time.

## Technical details

Depends on #6.

- Reached from the top bar's switcher at `#/waiting`, with the count of waiting items on the switcher
- Decisions and tasks as two lists side by side, each oldest first: by when the item was created, else by its
  session's start and then its number
- One-line rows naming the session, with one row open at a time. The open row shows the context, options and
  checklist
- The hub marks each item as waiting, from the same rule as the card's count
- Every session held in its terminal (a permission prompt or any other wait the session list reports) is listed
  separately, since it can only be answered there, and isn't counted as waiting

Answering comes with #11, and so does keeping rows in place under the pointer. Until then the open row is read-only.
The sidebar of sessions comes with #8.

## Out of scope

Answering, ticking or dismissing anything. The session sidebar.

## Acceptance criteria

- Every unanswered decision and unfinished owner task appears once, naming its session, oldest first within its list
- Opening a row closes the one that was open
- With nothing waiting, the view says so
