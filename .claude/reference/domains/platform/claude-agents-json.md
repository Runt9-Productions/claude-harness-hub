---
title: Claude Agents JSON List
type: note
permalink: platform/claude-agents-json
tags: ["claude-agents", "cli", "session-list", "background-sessions"]
verified: 2026-11-09
coverage: partial
measured_on: "Claude Code 2.1.321 (the claude stop line on 2.1.319), on Linux under WSL2"
---

# Claude Agents JSON List

> **Scope.** The fields `claude agents --json` and `--json --all` print and which sessions each lists: the agent view
> docs page read on 2026-11-09, and one run of each command on Claude Code 2.1.321 the same day, reading field names,
> value types and counts only. The run held one live interactive session and four background sessions with no
> process (3 `done`, 1 `stopped`). Not seen: a `blocked`, `failed` or `working` row, a `waiting` status with
> `waitingFor`, a background session with a live process, and many sessions at once.

Read this before writing the schema or the fixtures for `src/server/sources/agents.ts`, or trusting a field to be
present.

## Observations

| Field | Present, per the docs | Seen |
|---|---|---|
| `cwd`, `kind`, `startedAt` | Always | Every row. `startedAt` is Unix milliseconds |
| `id` | Background sessions | Every background row, 8 characters |
| `state` | Background sessions: `working`, `blocked`, `done`, `failed`, `stopped` | Every background row |
| `pid`, `status` | While the process is alive. `status` is `busy`, `waiting` or `idle` | The live interactive row only |
| `waitingFor` | When `status` is `waiting`: `permission prompt`, `input needed`, `sandbox request`, `worker request`, `dialog open` | Not seen |
| `sessionId`, `name` | When set. `sessionId` is the full UUID | Every row |

- [vendor] `--json` lists every live session plus background sessions still working or blocked after their process
  exited; `--all` adds completed background sessions, and the docs recommend polling `--json --all` from scripts
  (agent view docs, Anthropic, read 2026-11-09)
- [vendor] A background session finished or waiting for the next message and unattached for about an hour has its
  process stopped; one that ended its turn by asking a question counts as waiting, and the conversation stays on disk
  (agent view docs, read 2026-11-09)
- [vendor] Agent view is in research preview and its interface may change (agent view docs, read 2026-11-09)
- [fact] The plain list held 1 row, the live interactive session; `--all` held 5, adding the 3 `done` and 1 `stopped`
  background rows #measured
- [fact] A background row with no process had exactly `cwd`, `id`, `kind`, `name`, `sessionId`, `startedAt` and
  `state`, with no `pid` or `status`, for both `done` and `stopped` #measured
- [fact] The live interactive row had `cwd`, `kind`, `name`, `pid`, `sessionId`, `startedAt` and `status`, with no
  `id` or `state` #measured
- [trap] `status` and `sessionId` look required from live interactive sessions alone, but a stopped background row
  has no `status`, and the docs make `sessionId` conditional; a schema requiring either fails real rows
  #silent-failure
- [fact] `id` is the short id that `claude attach`, `claude logs` and `claude stop` take; on Claude Code 2.1.319
  `claude stop` gave "No job matching" for the full UUID #measured
- [fact] One run each took 0.21 s wall and 0.13 s CPU for `--json`, 0.17 s wall and 0.12 s CPU for `--json --all`,
  so `--all` costs no more at this size #measured
- [question] What `state` a background session reads after ending its turn with a board decision pending, and how
  the list scales with many sessions, are untried; the hub's row rule covers either `state`

## Relations

- see_also [[Hub Outside State]]
