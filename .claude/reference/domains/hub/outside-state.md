---
title: Hub Outside State
type: note
permalink: hub/outside-state
tags: ["sources", "claude-agents", "board-store", "away-store", "validation", "snapshot"]
verified: 2026-11-09
coverage: partial
measured_on: "Claude Code 2.1.319, on Linux"
---

# Hub Outside State

> **Scope.** How `src/server/sources` reads the session list and the `board` and `away` stores, how the snapshot is
> built from them, and which store fields the hub depends on, as agreed with the owner on 2026-11-08 and 2026-11-09
> before any hub code existed. The store measurements were taken on 2026-11-08 while designing and were not re-run;
> the store files and the plugins' code were not opened for this note. Not covered: the session list's own fields
> ([[Claude Agents JSON List]]), live reports from the `hub` plugin ([[Hub Plugin Socket]]).

Read this before touching `src/server/sources/`, the snapshot builder in `src/server/hub/`, or a store schema.

## Observations

### When sources run

- [invariant] Sources run on demand from a snapshot request, so no tab open means no background work; the socket
  routes still answer
- [invariant] Everything read here is validated where it enters, and an unknown shape is a visible error, never a
  default

### The session list

- [invariant] `execFile('claude', ['agents', '--json', '--all'])` with a 5 second timeout, `killSignal: 'SIGKILL'`
  and one call in flight. A child that ignores the default signal otherwise holds the callback past the timeout
- [invariant] It refreshes at most every 3 seconds, and a request waits for it only when no list exists yet. A failed
  call keeps the last list with an error beside it
- [invariant] Every `PATH` entry ending in `/node_modules/.bin` is removed from the child's `PATH`, because npm adds
  one per ancestor directory and a package's `bin` could otherwise supply `claude`. The child's working directory is
  fixed
- [invariant] A session's key is `sessionId`, else `id`. Commands need a `sessionId`
- [invariant] An unknown `kind`, `status`, `state` or `waitingFor` value shows its raw text beside an error and the
  rest of that session still builds, because the CLI updates itself
- [invariant] Which rows show: a row with a `pid` always shows. A row with no `pid` shows when `state` is `working`
  or `blocked`, or when `state` is `done`, `failed` or `stopped` and its board entry holds an unanswered decision or
  an unfinished owner task. Otherwise a background session that ended its turn with a decision pending leaves the
  queue when its process is stopped, and the queue reads empty while work waits #silent-failure
- [invariant] A row with no `pid` is read-only and says "process stopped: `claude attach <id>` wakes it"; once awake
  its `hub` plugin reconnects. A Wake button (`claude respawn <id>`) waits for real use to ask for it
- [invariant] A session needs the owner when it has an unanswered decision, an unfinished owner task,
  `status: waiting` or `state: blocked`. `waitingFor` says what holds it, and the report's `permissionTool` names the
  tool when there is one

### Stores

- [invariant] Config dir is `$CLAUDE_CONFIG_DIR` when set, otherwise `~/.claude`. Each request lists
  `<config dir>/plugins/store/` and keeps names matching `^(board|away)_.+\.json$`, stats each, and parses only when
  its modified time or size changed
- [fact] A marketplace install and a `--plugin-dir` copy write different store files with the same fields, and the
  live session's id was a `session:<id>` key in the marketplace file only #measured (2026-11-08)
- [invariant] So every matching file is read and each listed session id is looked up across them. When several hold
  an id, the board entry with the newest `savedAt` wins, and for away the newest file
- [invariant] Entries for sessions not on the list are never validated, so an old file's old shape raises nothing
- [invariant] The validator checks the fields the hub uses and ignores extra ones. A missing required field or an
  unknown enum value in one session's entry is that session's visible error, and other sessions carry on
- [invariant] A board option saved as a bare string is accepted and normalized, since the board plugin still reads
  those
- [invariant] Store writes are not proven atomic, so a parse failure keeps the last good copy and retries on the next
  request, becoming a visible error when the same file still fails after 10 seconds
- [fact] Both board stores held the full 20 entries, so the board plugin's pruning to the newest 20 does happen
  #measured (2026-11-08)
- [invariant] The hub depends on `board` re-saving from its 10 second refresh when the board is not empty and its key
  is missing, so a live session pruned from the store comes back within 10 seconds; this is harness work, not yet
  built

### Store fields the hub reads

Each plugin's README lists these, and renaming or removing one is a change to this contract.

- [invariant] Board, per `session:<id>`: `savedAt`, then the decisions, tasks and owner tasks lists
- [invariant] Decisions: `id`, `question`, `context`, `options`, `recommended`, `agentId`, `askedBy`, `plugin`,
  `isAnswerKept`, `answer`, `chosenOption`, `note` (once answered), `delivery`, `rev`, `createdAt`
- [invariant] Tasks: `id`, `title`, `status`, `note`, `holderId`, `items`
- [invariant] Owner tasks: `id`, `title`, `description`, `items`, `isStartPressed`, `isDone`, `agentId`, `postedBy`,
  `lastChange.summary`, `lastChange.delivery`, `rev`, `createdAt`
- [invariant] Away: `session:<id>` holding the mode as text; present keeps no key
- [invariant] `rev` and `createdAt` are new fields the harness adds to `board`; a missing `rev` reads as 0

### Building the snapshot

- [invariant] `hub` copies named fields into the snapshot. `toolUseIds`, `lastChange.message`, an unanswered
  decision's `note` and anything unnamed never reach the browser
- [invariant] Mode: the `hub` plugin's report wins; without one, the away store's value; with neither, `mode` is
  absent, because the session is either present or has no `away` plugin and the hub cannot tell. The view draws an
  absent mode as present
- [invariant] Waiting items sort by `createdAt`; an item without one sorts by its session's start, then its number
- [invariant] Plan usage: each session reports the windows from its last model response, so a reading can outlive
  its window. Per `kind`, drop readings whose `resetsAt` has passed, then take the latest `resetsAt`, then the highest
  `percentUsed`. A reading with no `resetsAt` sorts last; with nothing left, that kind shows no reading

### Accepted risks

- [risk] The store is a contract with plugins that treat it as private. Drift becomes a visible error. If it becomes
  a burden, board state can move into the plugin's reports, at the cost that a stopped session, a hub restart and a
  session without the plugin would show no board (accepted with the design, 2026-11-09)
- [risk] A stopped session's board can be pruned by 20 newer boards, since it cannot re-save; it then leaves the
  queue with that board lost (accepted with the design, 2026-11-09)
- [risk] The session list is a research preview interface that updates under the hub. An unknown value is a visible
  error that leaves answers working; a removed field or flag takes the list down with a visible error until the hub
  changes (accepted with the design, 2026-11-09)

## Relations

- part_of [[Hub Architecture]]
- depends_on [[Claude Agents JSON List]]
- see_also [[Hub Plugin Socket]]
- see_also [[Hub Commands]]
