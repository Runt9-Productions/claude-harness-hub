---
title: Session Dashboard Spec
type: note
permalink: projects/session-dashboard/spec
tags: ["dashboard", "file-map"]
---

# Session Dashboard Spec

What each file in #6 holds. The rules every file follows are in [[Hub Outside State]], [[Claude Agents JSON List]],
[[Hub Browser Code]] and [[Hub Architecture]]; this map says only what this slice builds of them.

## Observations

### 01 Session list source

- [invariant] `src/server/sources/agents.ts` runs `claude agents --json --all` as the session list note and the
  outside state note set out: `execFile`, 5 second timeout, `SIGKILL`, one call in flight, at most every 3 seconds,
  `node_modules/.bin` entries removed from the child's `PATH`, a fixed working directory, the last list kept with an
  error beside it on failure
- [invariant] Its schema requires only `cwd`, `kind` and `startedAt`; an unknown `kind`, `status`, `state` or
  `waitingFor` keeps its raw text and adds an error, and the rest of the row still builds
- [invariant] The stub `claude` in `src/e2e/fixtures/bin/` prints a checked-in fixture list for `agents --json --all`
  and keeps failing for anything else. The fixture list holds a live interactive session, a waiting one, a background
  `working` one and a stopped one with a pending decision, all invented
- [invariant] Tests drive it through a stub on `PATH` in a temporary directory: a good list, an unknown value, a
  missing required field, a child that hangs past the timeout, a failure after a good list

### 02 Store source

- [invariant] `src/server/sources/stores.ts` lists `<config dir>/plugins/store/` for `^(board|away)_.+\.json$`,
  stats each file and parses only on a changed modified time or size, and looks each listed session id up across all
  files: the board entry with the newest `savedAt` wins, and for away the newest file
- [invariant] Only entries for listed sessions are validated, with `z.object` over the fields the outside state note
  lists, so extra fields pass. A bad entry is that session's error; a bare-string option is normalized
- [invariant] A parse failure keeps the last good copy and becomes an error only when the same file still fails after
  10 seconds; time is passed in
- [invariant] Fixture stores in `src/e2e/fixtures/.claude/plugins/store/` match the fixture list's session ids:
  decisions answered and unanswered, owner tasks, agent tasks with items, an away and a distracted mode

### 03 Snapshot

- [invariant] `src/shared/api.ts` gains `SessionView`, `DecisionView`, `OwnerTaskView`, `TaskView` and `Delivery` as
  [[Hub Browser Surface]] defines them, without `activity`, `contextPercent`, `usage` and `commands`, which later
  slices add
- [invariant] `src/server/hub/snapshot.ts` is pure: from a session list, the stores' entries and `now` it builds the
  sessions and errors. It applies which rows show, needs-you, the key (`sessionId`, else `id`), `shortId`,
  `isProcessAlive`, `hasUnreadAnswers`, mode from the away store, and copies named fields only. `canAnswer` and
  `canSetMode` are false, since no plugin connects yet
- [invariant] `start(config)` gains `configDir`. Each snapshot request runs both sources, and nothing runs without a
  request. The command line takes `$CLAUDE_CONFIG_DIR`, else `~/.claude`
- [invariant] Tests go through `start` with a temporary config dir and the stub on `PATH`, plus direct tests of the
  row and needs-you rules that no boundary test separates

### 04 Dashboard view

- [invariant] `src/web/logic/snapshot.ts` reads the full `SessionView` by hand, field by field, failing with the
  field's name
- [invariant] `src/web/logic/` gains grouping ("Needs you", then "Everything else", each by `startedAt`), the count
  of sessions by state for the top bar, and dealing cards into columns, with tests
- [invariant] `src/web/ui/`: the top bar (the Dashboard and Everything waiting switcher with only Dashboard live, the
  counts, and a disabled Set all sessions dropdown that says it arrives later) and a card per session: name, working
  directory, kind, state, mode, the waiting count, and agent tasks at 3 lines, blocked first, with "Show more"
  expanding the card in place. A stopped session's card says "process stopped: `claude attach <id>` wakes it". An
  error for a session shows on its card; other errors show under the top bar
- [invariant] `src/web/styles.css` takes its tokens and card look from the combined mockup, with the column count
  set by the viewport width and no card stretched to fill space
- [invariant] `.claude/reference/domains/hub/style-guide.md` holds the tokens, the card's parts and the rules above
  for later views

### 05 Docs

- [invariant] The outside state, session list and architecture notes gain `sources` for the new files, and each
  question this slice answers is closed

## Issue text

The proposed body for #6:

```markdown
Show every session as a dashboard card, with sessions that need the owner on top

## Objective

Give the owner a dashboard to leave up on a second monitor: one card per session, updating by itself, with the
sessions that need them grouped first. It keeps one session's information in a tight space.

## Technical details

Depends on #5.

- Sessions come from `claude agents --json --all`, read and validated as the outside state note in
  `.claude/reference/` sets out. A session with no process shows only while it is working or blocked, or holds an
  unanswered decision or unfinished owner task; its card is read-only and says how to wake it
- Boards and modes come from the `board` and `away` store files under the config dir, every matching file, checked
  by modified time before parsing. A parse failure is retried and shown only if it persists
- A session needs the owner when it has an unanswered decision, an unfinished owner task, a `waiting` status or a
  `blocked` state
- A top bar in the same place in every view: the view switcher, a count of sessions by state, and Set all sessions
  as a disabled placeholder until #13
- Two groups, "Needs you" and "Everything else". A card moves only when it starts or stops needing the owner
- Cards stay in fixed columns, so a tall card pushes down only the cards beneath it. Nothing stretches to fill empty
  space when few sessions run
- Agent task lists show 3 lines, blocked tasks first, with "Show more" expanding the card in place
- Mode as text: present plain, distracted blue, away yellow
- Dark only, on a low-saturation slate palette, and every button has a hover state. An HTML and CSS style guide lands
  with this slice
- Adds zod through the owner's install, after an evidence packet

Agent status lines arrive with #9, and context bars and plan usage with #10.

## Out of scope

Acting on anything. Opening a session or the waiting list beyond the switcher itself. Reports from the `hub` plugin.

## Acceptance criteria

- Each session has a card showing its name, directory, kind, state, mode, waiting count and open agent tasks
- A session starting, stopping or changing state shows within seconds without a reload
- A session with no board looks normal, and a store or list entry with an unknown shape is a visible error
- With one session, the page shows one ordinary card and no stretched layout
```
