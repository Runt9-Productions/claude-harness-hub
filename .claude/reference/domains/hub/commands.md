---
title: Hub Commands
type: note
permalink: hub/commands
tags: ["commands", "queue", "board", "away", "rev", "delivery", "lifecycle"]
verified: 2026-11-09
coverage: partial
measured_on: "Claude Code 2.1.319, on Linux"
---

# Hub Commands

> **Scope.** Every browser command, its checks in the hub and in the receiving plugin, the queue that hands it out,
> its lifecycle states and how the view shows the result, as agreed with the owner on 2026-11-08 and 2026-11-09
> before any hub code existed. Measured lines come from probes on 2026-11-08 and were not re-run; the `board` and
> `away` code was not opened, so claims about today's pane functions are the design's reading. Not covered: how a
> command travels over the socket and between plugins ([[Hub Plugin Socket]]).

Read this before touching `POST /api/commands`, the command queue in `src/server/hub/`, the command types in
`src/shared`, or the plugin side of applying one.

## Observations

### The commands

Every command has `id` (made by the server), `sessionId`, `plugin` and `kind`.

| `plugin` | `kind` | Other fields | Rejected with |
|---|---|---|---|
| `board` | `answer.option` | `decisionId`, `rev`, `label`, optional `note` | `no such decision`, `already answered`, `changed`, `option not offered` |
| `board` | `answer.note` | `decisionId`, `rev`, `text` | same, except the last, plus `empty note` |
| `board` | `answer.dismiss` | `decisionId`, `rev`, optional `note` | `no such decision`, `already answered`, `changed` |
| `board` | `task.start` | `taskId`, `rev` | `no such task`, `changed`, `task done` |
| `board` | `task.setItem` | `taskId`, `rev`, `label`, `isTicked` | same, plus `no such item` |
| `board` | `task.done` | `taskId`, `rev` | `no such task`, `changed`, `task done` |
| `board` | `sendNow` | None | `session not idle`, `nothing unread`, `submit refused: <why>` |
| `away` | `setMode` | `mode` | `unknown mode` |

- [invariant] Any kind can also be rejected with `unknown kind`, `bad shape`, `session changed` or `threw`
- [invariant] `POST /api/commands` is the only way a command enters. Before queuing it reads fresh state and checks
  the session has a `sessionId`, a `pid` and a connected `hub` plugin, then per kind: the item exists and is not
  finished, `rev` matches, the option is one of its labels; for `sendNow`, the session is idle with
  `hasUnreadAnswers`. A 409 uses the same words as the plugin's rejections
- [invariant] `hasUnreadAnswers` is the plugin's own test: no `agentId`, and a decision's `delivery` or an owner
  task's `lastChange.delivery` is `sent`
- [invariant] Set all and Send all are a loop in the browser over per-session commands, so each session's failure
  shows on its own. Setting all to present sends each away session's return report, one turn each, as `/mode present`
  does

### Applying a command in the plugin

- [invariant] One function per kind decides inside the store `update` and returns `{ outcome, reason? }`, with the
  pane's functions as callers where they fit. Today's pane functions return nothing whether or not they changed
  anything, and two of them toggle (design's reading of the harness code)
- [invariant] Board commands run through `pressOnBoard($, command.sessionId, act)`, which must return whether it ran,
  so a session whose id changed since the hand-out rejects with `session changed`; `away` compares `$.session.id()`
  itself
- [invariant] Commands state target values: `task.start` and `task.setItem` set a value, never toggle
- [invariant] A command's `note` is passed as an argument; a half-typed note on the pane does not go out with it
- [invariant] `rev` is compared inside the `update`. It rises only when a decision's `question`, `context`,
  `options` or `recommended` changes, or an owner task's `title` or `description` changes, because a reworded item
  can keep its labels and change their meaning
- [trap] `rev` must never rise for a note draft, an answer, a delivery state, the owner's tick or a checklist edit,
  which would fail the hub's next press in normal use
- [invariant] Item commands go by label and have `no such item`
- [fact] Awaited mid-turn, `$.prompt.submit` took 48.7 seconds and blocked the caller, then ran as an extra turn
  #measured
- [invariant] So `sendNow` checks the session is idle and does not wait on `$.prompt.submit`; its outcome is written
  when the call settles, with the platform's `drop` text as `<why>`
- [invariant] `setMode` only ever calls `switchMode`, and at-target is `applied` with nothing done, because
  `/mode present` typed while present puts the sandbox back for every holder in the checkout; that stays a typed
  command

### The queue in the hub

- [decision] Each command is handed out once, to one held request, the newest for that session, with no retries:
  a replay cannot happen and two processes on one session id cannot both apply it (owner, 2026-11-08)
- [invariant] One `setMode` is out at a time across all sessions, because away's sandbox record is a
  read-modify-write of a store key, `$.store` has no atomic update, and Set all would otherwise land several at once
- [invariant] A new `setMode` for a session replaces its queued one, which ends `rejected` with `replaced`, so
  pressing Away then Present ends at Present
- [invariant] The at-target check for `setMode` happens at hand-out from the session's latest report; a session
  already at the target is marked `applied` without using the slot
- [invariant] The queue advances on every plugin request, every result and every snapshot, so it moves with no tab
  open
- [invariant] The queue is in memory and keeps 10 minutes of commands. A hub restart forgets it; the board's own
  state still shows each answer

### Lifecycle

| State | Meaning | Moves on when |
|---|---|---|
| `queued` | Waiting for that session's held request, normally open, which takes it at once | Handed to a request; `notPickedUp` after 30 seconds (a `setMode` counts from reaching the front); `sessionGone` when its session has no `pid` or leaves the list |
| `handed` | Given to one held request | A result arrives (`applied` or `rejected`); `noResult` after 30 seconds. A later result replaces `noResult` |

- [invariant] The view shows `queued` and `handed` as "sending", `rejected` with its reason, and `notPickedUp`,
  `sessionGone` and `noResult` as failures, each of which enables the buttons again
- [invariant] It shows only the newest command per item, and per session for `setMode`, so a replaced command never
  shows

After `applied`, what is shown comes from the item itself, so answers given on the pane are covered too:

| Item's `delivery` | Shown as |
|---|---|
| `sending`, `sent` | Sent |
| `seen`, on an answer delivered to a loop | Read |
| `seen`, on a kept answer | Kept by its plugin |
| `failed` | Failed, tell it yourself |

- [invariant] An owner task's delivery is `lastChange.delivery`, whose slot holds only its newest change. An
  `applied` command whose item has left the board shows as Sent

### Accepted risks

- [risk] `sendNow` and `setMode present` have the widest reach of any command: a forged answer makes a session
  eligible for `sendNow`, and `setMode present` releases the away sandbox and tells the model the away rules no longer
  apply. Only a process outside the sandbox can forge one, see [[Hub Plugin Socket]] (accepted with the design,
  2026-11-09)

## Relations

- part_of [[Hub Architecture]]
- depends_on [[Hub Plugin Socket]]
- see_also [[Hub Outside State]]
- see_also [[Hub Browser Surface]]
