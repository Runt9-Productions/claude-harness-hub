---
title: Hub Outside State
type: note
permalink: hub/outside-state
tags: ["sources", "claude-agents", "board-store", "away-store", "validation", "snapshot"]
verified: 2026-11-11
coverage: partial
sources:
  - "src/server/sources/agents.ts"
  - "src/server/sources/stores.ts"
  - "src/server/sources/issues.ts"
  - "src/server/hub/snapshot.ts"
  - "src/server/main.ts"
  - "src/web/logic/dashboard.ts"
  - "src/web/ui/dashboard.tsx"
measured_on: "Claude Code 2.1.319, on Linux"
---

# Hub Outside State

> **Scope.** How `src/server/sources` reads the session list and the `board` and `away` stores, how
> `src/server/hub/snapshot.ts` builds the snapshot from them, and which store fields the hub depends on. The design
> was agreed with the owner on 2026-11-08 and 2026-11-09; on #26 the session list, store and snapshot lines were
> checked against the sources listed, and the store field lines against the `board` and `away` plugins' code in
> runt9-claude-harness at `283ad99`, read only. That code is not in `sources`, so a harness change does not mark this
> note stale. Carried forward unchecked, since no code holds them yet: the `hub` plugin's report (its mode and
> `permissionTool`), the Wake button, the waiting items' order and plan usage. The store measurements were taken on
> 2026-11-08 and were not re-run, and no real store file was opened. Not covered: the session list's own fields
> ([[Claude Agents JSON List]]), live reports from the `hub` plugin ([[Hub Plugin Socket]]), and how a card looks
> ([[Hub Style Guide]]).

Read this before touching `src/server/sources/`, the snapshot builder in `src/server/hub/`, or a store schema.

## Observations

### When sources run

- [invariant] Sources run only from a snapshot request: `start` makes one session list source and one store source,
  and each `GET /api/snapshot` reads the list, passes its `sessionId`s to the stores with the same `now`, and builds
  (`snapshot`, `src/server/main.ts:56`). No tab open means no background work; the socket routes, not built yet, would
  still answer
- [invariant] Everything read here is validated where it enters, and an unknown shape is a visible error, never a
  default

### The session list

- [invariant] `execFile('claude', ['agents', '--json', '--all'])` with a 5 second timeout, `killSignal: 'SIGKILL'`,
  the home directory as its working directory, and one call in flight. A child that ignores the default signal
  otherwise holds the callback past the timeout (`runList`, `src/server/sources/agents.ts:117`)
- [invariant] A call starts at most every 3 seconds of `now`, and a request waits for it only while no list has been
  read yet; otherwise it answers with the last list at once and the refresh shows on a later request. A failed call
  keeps the last list and its row errors, plus one call error that the next good call clears (`read`,
  `src/server/sources/agents.ts:166`)
- [fact] A `now` earlier than the last start counts as due, so a clock set back cannot freeze the list (`isDue`,
  `src/server/sources/agents.ts:139`)
- [invariant] Every `PATH` entry ending in `/node_modules/.bin` is removed from the child's `PATH`, because npm adds
  one per ancestor directory and a package's `bin` could otherwise supply `claude` (`childPath`,
  `src/server/sources/agents.ts:100`)
- [invariant] A call error is built from the exit code, error code or signal only, never from `execFile`'s own
  message, which embeds stderr (`callFailureMessage`, `src/server/sources/agents.ts:108`)
- [fact] Each row is parsed on its own and needs only `cwd`, `kind` and `startedAt`. A row that fails is dropped with
  `row <n>: <field path>: <message>` and no `sessionId`, the other rows carry on, and fields the schema does not name
  are stripped (`rowSchema`, `src/server/sources/agents.ts:23`)
- [invariant] An unknown `kind`, `status`, `state` or `waitingFor` value keeps its raw text and adds
  `unknown <field> value` with the row's key as `sessionId`, and the rest of that session still builds, because the
  CLI updates itself. The known values are listed only in `agents.ts` (`knownValues`,
  `src/server/sources/agents.ts:15`)
- [invariant] A session's key is `sessionId`, else `id`, and a row with neither is dropped with an error. Commands
  need a `sessionId` (`buildSnapshot`, `src/server/hub/snapshot.ts:187`)
- [invariant] Which rows show: a row with a `pid` always shows. A row with no `pid` shows when `state` is `working`
  or `blocked`, or when `state` is `done`, `failed` or `stopped` and its board entry holds an unanswered decision or
  an unfinished owner task; with no `state` it is hidden. Otherwise a background session that ended its turn with a
  decision pending leaves the queue when its process is stopped, and the queue reads empty while work waits
  #silent-failure (`isShown`, `src/server/hub/snapshot.ts:69`)
- [trap] The stores are looked up by full `sessionId` only, so a row with only a short `id` gets no board, no mode
  and no store error, and with no `pid` and an ended `state` it is hidden whatever its board holds (`storedSession`,
  `src/server/hub/snapshot.ts:178`)
- [trap] A board entry that fails validation counts as no owner work as well, so a stopped session whose entry fails
  is hidden, and its store error, with no card to go on, shows under the top bar (`placeErrors`,
  `src/web/logic/dashboard.ts:63`)
- [invariant] A row with no `pid` is read-only. Its card says "process stopped: `claude attach <id>` wakes it" with
  the short `id`, or only "process stopped" when it has none (`Card`, `src/web/ui/dashboard.tsx:109`); once awake its
  `hub` plugin reconnects. A Wake button (`claude respawn <id>`) waits for real use to ask for it
- [invariant] A session needs the owner when it has an unanswered decision, an unfinished owner task,
  `status: waiting` or `state: blocked`. The hub sets this as `needsYou` on each `SessionView` (`needsYou`,
  `src/server/hub/snapshot.ts:76`). `waitingFor` says what holds it, and the report's `permissionTool` will name the
  tool when there is one

### Stores

- [invariant] Config dir is `$CLAUDE_CONFIG_DIR` when set, otherwise `~/.claude`. A relative `$CLAUDE_CONFIG_DIR`,
  the empty string included, refuses to start (`configDirFromEnvironment`, `src/server/main.ts:109`)
- [invariant] Each request lists `<config dir>/plugins/store/`, keeps names matching `^board_.+\.json$` or
  `^away_.+\.json$`, `lstat`s each, and parses a file again only when its modified time or size changed or its last
  parse failed. A missing directory is no stores and no error (`readFiles`, `src/server/sources/stores.ts:199`)
- [invariant] A matching name that is not a regular file, such as a symlink or a directory, is an error and is never
  read, so a link cannot lead out of the store directory
- [fact] A marketplace install and a `--plugin-dir` copy write different store files with the same fields, and the
  live session's id was a `session:<id>` key in the marketplace file only #measured (2026-11-08)
- [invariant] So every matching file is read and each listed session id is looked up across them as `session:<id>`.
  When several hold an id, the board entry with the highest `savedAt` wins, one without `savedAt` ranking 0 as the
  board plugin's pruning ranks it, and for away the most recently modified file holding the key wins. A tie goes to
  the first file in name order (`lookUp`, `src/server/sources/stores.ts:228`)
- [invariant] Only the winning entry of a listed session is validated, so neither an unlisted session's old shape nor
  a losing older copy raises anything
- [invariant] The schemas are `z.object`, so they check the fields the hub uses and strip the rest. A missing
  required field or an unknown enum value in one session's entry is that session's error
  (`<field path>: <message>`), its board or mode is left out, and other sessions carry on
- [trap] Task `status` is checked against the board's own four values, unlike the CLI's open values, so a status the
  board adds later drops the board of every session holding one, each with an error (`taskSchema`,
  `src/server/sources/stores.ts:42`)
- [invariant] A board option saved as a bare string is accepted and normalized to `{ label }`, since the board plugin
  still reads those
- [invariant] Store writes are not proven atomic, so a file that fails to read or to parse as a JSON object keeps its
  last good copy and is retried on each request. It becomes an error with no `sessionId` once it has failed for 10
  seconds of `now`, and the error clears when it parses (`refreshFile`, `src/server/sources/stores.ts:187`)
- [fact] A file first seen half-written has no good copy, so for up to 10 seconds its sessions show no board and no
  error
- [fact] Both board stores held the full 20 entries, so the board plugin's pruning to the newest 20 does happen
  #measured (2026-11-08)
- [fact] The board plugin deletes a session's key when its board is empty, so a listed session with no board entry
  is the usual case and shows empty lists (`save`, `board/hooks/persistence.ts:61` in runt9-claude-harness)
- [invariant] The hub depends on `board` re-saving from its 10 second refresh when the board is not empty and its key
  is missing, so a live session pruned from the store comes back within 10 seconds. At `283ad99` that refresh
  (`refreshFromAgentList`, `board/hooks/activity.ts:215`) saves nothing and pruning runs only at session start, so
  this is harness work still to build

### Store fields the hub reads

The fields are declared in the board plugin's `types/index.d.ts` and its saved shape, `SavedBoard`
(`hooks/persistence.ts:14`), and in the away plugin's `hooks/register.tsx`; neither plugin's README lists them.
Renaming or removing one is a change to this contract. The hub's schemas are in `src/server/sources/stores.ts`, from
`deliverySchema` to `modeSchema`.

- [invariant] Board, per `session:<id>`: `savedAt`, then the decisions, tasks and owner tasks lists. All four are
  optional in the saved shape: a missing list reads as empty, as the board's own restore reads it (`writeBoard`,
  `board/hooks/persistence.ts:140`), and a missing `savedAt` ranks 0
- [invariant] Decisions: `id`, `question`, `context`, `options`, `recommended`, `agentId`, `askedBy`, `plugin`,
  `isAnswerKept`, `answer`, `chosenOption`, `note` (once answered), `delivery`, `rev`, `createdAt`. Only `id`,
  `question` and `options` are required, and a missing `isAnswerKept` reads as false, as the board means it
  (`decisionSchema`, `src/server/sources/stores.ts:24`)
- [invariant] Tasks: `id`, `title`, `status`, `note`, `holderId`, `items`. The board leaves `items` out when it is
  empty, and the hub reads that as `[]`
- [invariant] Owner tasks: `id`, `title`, `description`, `items`, `isStartPressed`, `isDone`, `agentId`, `postedBy`,
  `lastChange.summary`, `lastChange.delivery`, `rev`, `createdAt`. `id`, `title`, `items` and `isDone` are required;
  a missing `isStartPressed` reads as not pressed, and `lastChange` is absent until the owner first ticks an item or
  presses Done (`ownerTaskSchema`, `src/server/sources/stores.ts:51`)
- [invariant] Away: `session:<id>` holding the mode as a bare string, `distracted` or `away`; present deletes the key.
  The hub also accepts `present`, since the plugin's own reader does (`loadMode` and `save`,
  `away/hooks/register.tsx:118`)
- [fact] Neither plugin's code sets the file's layout, since both only call `$.store.set(key, value)`; that a file is
  one object keyed by store key rests on the 2026-11-08 measurement above
- [invariant] `rev` and `createdAt` are new fields the harness adds to `board`. At `283ad99` neither is in the board's
  types, so the hub reads a missing `rev` as 0 and takes `createdAt` as optional

### Building the snapshot

- [invariant] `hub` copies named fields into the snapshot. `toolUseIds`, `lastChange.message`, `agentId`, `savedAt`
  and anything unnamed never reach the browser, and a decision's `note`, `chosenOption` and `delivery` are copied
  only once `answer` is present, since the board keeps the owner's unsent note draft in `note` (`decisionView`,
  `src/server/hub/snapshot.ts:105`)
- [invariant] `hasUnreadAnswers` is a decision with no `agentId` and `delivery: 'sent'`, or an owner task with no
  `agentId` and `lastChange.delivery: 'sent'`, the board plugin's own test for an answer the main session has not
  read (`hasUnreadAnswers`, `src/server/hub/snapshot.ts:91`; `isAnswerForMain`, `board/hooks/decisions.ts:377`)
- [fact] `canAnswer` and `canSetMode` are false for every session, since no `hub` plugin connects yet
  (`sessionView`, `src/server/hub/snapshot.ts:152`)
- [invariant] Mode: the `hub` plugin's report wins; without one, the away store's value; with neither, `mode` is
  absent, because the session is either present or has no `away` plugin and the hub cannot tell. The view draws an
  absent mode as present (`StateLine`, `src/web/ui/dashboard.tsx:41`)
- [fact] `errors` holds the list's, then the stores', then the builder's own, and is not filtered to the sessions
  shown. The browser puts an error on the card whose `key` equals its `sessionId`, and any other under the top bar
- [trap] `buildSnapshot` throws when the store read has no entry for a listed `sessionId`, which the store source
  always returns, so that request answers 500 (`storedSession`, `src/server/hub/snapshot.ts:178`)
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
