---
title: Hub Plugin Socket
type: note
permalink: hub/plugin-socket
tags: ["hub-plugin", "unix-socket", "long-poll", "plugin-state", "session-id", "report", "contract"]
verified: 2026-11-09
coverage: partial
measured_on: "Claude Code 2.1.319, on Linux"
---

# Hub Plugin Socket

> **Scope.** The contract between the hub and the `hub` plugin in runt9-claude-harness: the socket, its routes,
> reports, what the plugin does, how commands pass between plugins through shared session state, and what happens
> when a session's id changes. Agreed with the owner on 2026-11-08 and 2026-11-09 before any hub or `hub` plugin code
> existed. Measured lines come from probes on 2026-11-08 with stand-in plugins in real interactive sessions, and were
> not re-run for this note; the harness plugins' code was not opened. Not covered: what each command does and how it
> is applied ([[Hub Commands]]).

Read this before touching `src/server/http/plugin.ts`, the socket setup in `src/server/main.ts`, the fake plugin in
`src/e2e`, or the `hub` plugin's side of the contract.

## Observations

### Who talks to whom

- [decision] One optional `hub` plugin in each session holds a waiting request to the hub and is the only plugin
  that talks to it; installing it is what opts a session in, and `board` and `away` never touch the network
  (owner, 2026-11-08)
- [decision] Commands pass from `hub` to `board` and `away` through shared session state, not a tool call
  (owner, 2026-11-08)

### Location and startup

- [invariant] The socket is `<config dir>/hub/hub.sock`. The plugin finds the config dir from
  `$.env.get('CLAUDE_CONFIG_DIR')`, then `$.env.get('HOME')` plus `/.claude`; a hub and a session that disagree see
  nothing of each other #silent-failure
- [invariant] Browsers cannot reach a Unix socket, so its routes need no `Host`, token or `Origin` checks
- [invariant] At startup the directory must be a real directory (by `lstat`) owned by this user with mode `0700`,
  created if missing and otherwise refused
- [invariant] An existing path at the socket is connected to: if something answers, another hub runs and this one
  refuses to start. If the connection is refused and `lstat` says it is a socket, it is removed, with `ENOENT`
  tolerated around both calls in case another start got there first #order-dependent
- [invariant] A socket path over 100 bytes refuses to start; the platform's types state a limit near 100 bytes and
  refuse a relative path
- [invariant] The hub removes the socket on exit

### Routes

| Route | Body | Answer |
|---|---|---|
| `POST /v1/wait` | `{ connectionId, sessionId, report }` | `{ commands: Command[] }`, at most 20. At once when commands wait for that session, otherwise held up to 25 seconds and answered with an empty list |
| `POST /v1/report` | `{ connectionId, sessionId, report }` | 204. Replaces the report. A new `sessionId` moves this connection's held request to that id and answers it at once if commands wait there |
| `POST /v1/result` | `{ id, outcome: 'applied' \| 'rejected', reason? }` | 204, also for an unknown id |

- [invariant] `reason` on `applied` is a warning shown beside it, such as a rules row that did not reach the model
- [invariant] A held request belongs to a connection (a random id per plugin load), not to a session id, because
  `$.http.fetch` cannot be cancelled and a session's id can change while a request is held. Commands queue by session
  id, so a reload that starts a new connection leaves nothing stranded
- [fact] `$.http.fetch` rejects after 30 seconds against a hub that never answers, so the hold is 25 seconds
  #measured
- [invariant] A new request on a connection that already holds one answers the old one with an empty list
- [invariant] A `/v1/wait` gets a 200 with commands whenever `connectionId` and `sessionId` validate. An invalid
  `report` becomes that session's entry in `errors` and the last good one is kept, so a bad status line never stops
  answers
- [invariant] A body over 256 KiB (the socket's own cap) is a 413, and a bad `connectionId` or `sessionId` is a 422;
  neither returns commands
- [invariant] An unknown version in the path is a 404 and adds an entry to the hub's `errors` naming the path, so a
  plugin newer than the hub shows the owner why the buttons are off
- [invariant] `close()` answers every held request with an empty list, so exit does not wait on them

### Reports

```ts
type Report = {
  activity?: { agentId: string; label: string; state: 'working' | 'idle' | 'permission'
               status?: string; statusAt: number; since: number; permissionTool?: string }[]
  context?: { percent: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  mode?: 'present' | 'distracted' | 'away'
  sandboxProblem?: string
}
```

- [invariant] The full report comes with every `/v1/wait`, so a hub restart recovers within one request, and on
  `/v1/report` only when something really changed. Reports are held in memory per connection and can only change
  what is displayed
- [invariant] When a connection's request closes and no new one comes within 3 seconds, its report leaves the
  snapshot: `activity` and `contextPercent` go absent and `mode` falls back to the store
- [fact] The stand-in hub saw a disconnect at once on `/exit` (428 ms with a request held); a frozen process drops
  out when its hold ends #measured
- [invariant] `activity` comes from `board`'s `$.state`, `mode` and `sandboxProblem` from `away`'s, usage from
  `$.session.usage()`. A field is absent when its plugin is not loaded, and for a while after a session id change
- [invariant] The plugin copies named fields only, cuts `status` and `label` to 200 characters and sends at most 50
  rows
- [fact] `$.session.usage()` works from a timer with no model call; `context.percent` is absent until the first
  response after a start, a resume or a compaction, so `context` is sent only when `typeof percent === 'number'`
  #measured
- [invariant] `sandboxProblem` is present while an away session's sandbox is not held, whatever the cause (a failed
  hold, a higher settings source, a `/cd`, `/mode present` typed in another session in the same checkout). `away`
  works it out from its hold record and last failure, rechecks every 10 seconds while away, and the card says "away,
  sandbox off: <reason>"
- [invariant] `canAnswer` is true while the session has a held request or had one in the last 3 seconds, which covers
  the plugin's 2 second retry. `canSetMode` also needs a `mode` in its report

### What the `hub` plugin does

- [invariant] At `session.start` with `e.isInteractive` false it does nothing more, because `claude -p` does not exit
  until a held request ends
- [fact] `claude -p` with a 25 second hold took 26 seconds against 5 without the plugin, because `session.end` waits
  for the pending `$.http.fetch`; starting no loop when not interactive gave 5 seconds #measured
- [invariant] Otherwise it makes a `connectionId` and starts its loop from a `$.clock.after`, so a hot reload ends
  the loop with the module's timers
- [invariant] The loop reads `$.session.id()`, builds the full report, posts `/v1/wait`, writes each command it gets
  to its own `command` key in order, then asks again at once. A failed connection is normal and silent and is retried
  after 2 seconds. It never waits for a command to be applied
- [fact] A dead hub's leftover socket fails at once with `ECONNREFUSED`, silently, and the loop recovers when the
  hub returns; a restarted hub got a new request 2 seconds later #measured
- [fact] A held request delivered a command in 7 to 15 ms idle, held by a permission prompt, during a 40 second tool
  call and with the sandbox on #measured
- [invariant] It hooks `state.set` on `board`'s `activity` and `away`'s `mode` and `sandboxProblem`, reads usage at
  `turn.step` and `turn.complete`, and posts `/v1/report` only when a named field differs from what it last sent
- [fact] `board`'s 10 second refresh wrote `activity` 12 times in 2 idle minutes with no value differing #measured
- [invariant] It never awaits a post inside a hook: awaited against a 1.5 second hub, every hooked write was held for
  1.5 seconds; not awaited, no delay was seen #measured
- [invariant] It hooks `state.set` on `board`'s and `away`'s `commandOutcome` keys and posts each outcome to
  `/v1/result`

### Shared state between plugins

- [fact] A plugin can read any plugin's `$.state` and hook its changes, and can write only its own; a key of a plugin
  that is not loaded reads `undefined` at version 0, the same as an unwritten key #measured
- [invariant] The path: `hub` writes `{ plugin: 'hub', key: 'command' }`; `board` and `away` hook it, and the one the
  command's `plugin` names schedules the apply with `$.clock.after(1, ...)` and returns; from that timer it validates,
  applies and writes `{ id, outcome, reason? }` to its own `commandOutcome` key, a throw becoming `rejected` with
  `threw`; `hub`'s hook posts it #order-dependent
- [trap] Applied inside the hook, the outcome write counts as `hub`'s own code and `hub`'s hook on it is skipped; the
  only trace is a debug log line `state.set skipped: re-entry` #silent-failure #measured
- [fact] Shared state with a timer took 11 to 17 ms from queuing at the hub to the outcome there, idle, held by a
  prompt and mid-tool; five commands at once applied in order with none lost, 100 of 100; nothing showed in the pane
  over 45 commands and the model read every row #measured
- [trap] `$.tool.call` was rejected as the route because it puts the tool in the model's list, where the model loaded
  and called it, and a door that throws raises a permission prompt that stalls the loop until someone answers
  #measured
- [risk] Shared state relies on a write started from a timer not counting as the caller's own code, which the
  platform's types do not mention. If a later Claude Code moves that guard, commands still apply but show as
  `noResult`, and pressing again is rejected as `already answered` (accepted with the design, 2026-11-09)
- [risk] A failure between plugins is quiet: with `board` or `away` missing, or crashed in a way the `threw` path
  misses, shared state gives no signal and the command shows as `noResult` only after 30 seconds (accepted with the
  design, 2026-11-09)
- [question] Real `board` and `away` as the receiving end were not measured, only stand-ins; a throwaway real session
  run through it once before answering ships settles it

### When the session id changes

- [fact] `/clear`, `/resume <id>` and `/branch` carry on in the same process under another id with no
  `session.start`, and empty every key of every plugin's `$.state` without raising a hook; the version counter carries
  on #measured
- [fact] `session.end` fires with reason `clear` or `resume` (`/branch` also reads `resume`) 14 to 96 ms after Enter,
  while `$.session.id()` is still the old id; the new id is readable within 20 ms #measured
- [invariant] So at `session.end` with those reasons `hub` pauses its loop and 100 ms later posts `/v1/report` under
  the new id, which moves the held request. Without it a command for the new id waited out the hold (23 seconds in
  one run) #measured
- [fact] A row appended 3 to 5 ms after the move to `/resume` or `/branch` was lost while reporting success, and rows
  at 12 ms or later were kept (0 of 27, and 0 of 45 from a separate driver); no gap from 6 to 11 ms was measured
  #silent-failure #measured
- [invariant] The 100 ms wait is a margin, not a fix: the cause of the lost row is not known
- [risk] A command already queued for a session at the moment it moves back to that id could still be lost, reading
  as Sent with the agent never told (accepted with the design, 2026-11-09)
- [fact] After a move the report has no `activity` until `board`'s refresh runs `bind` (3 to 8 seconds), no `mode`
  until `away`'s next `turn.start`, and no `context` until the first response, so `canSetMode` is false until then
  #measured
- [fact] `/bg` is a new process with a new id: the old request closes and the new process holds within about 2
  seconds under its new id; `/exit` then `--resume` keeps the id in a new process #measured
- [fact] An edit under `--plugin-dir` reloaded the module, closed the old request and left exactly one holder, with
  `$.state` kept; `/reload-plugins` with no edit did nothing #measured
- [question] `/reload-plugins` reloading an installed plugin, a `/mode` change raising the hook on `away`'s `mode`,
  and `$.http.fetch` at the real `<config dir>/hub/` path (an organization's web-fetch policy could refuse it, which
  shows as `canAnswer` false) are untried

### Accepted risks for the socket

- [risk] A process running as the owner outside the sandbox can stand up its own hub when none runs, or replace the
  socket, and every session with the `hub` plugin connects to it, including on a machine that never ran a hub. Text
  reaches a session only as the answer to an unanswered decision; `setMode present` releases the away sandbox for
  every away session at once; `sendNow` starts a turn where a forged answer is unread. Such a process can already add
  a hook to the user's settings, so it gains no reach; sandboxed Bash cannot write under `~/.claude`. Not installing
  the plugin is the off switch (accepted with the design, 2026-11-09)
- [risk] The same process can read or take a session's pending commands, post a false result or send a false report,
  which suppresses or misleads (accepted with the design, 2026-11-09)
- [risk] Native Windows sessions are not covered: a plugin finds the config dir through `HOME` and connects to a Unix
  socket, and neither was tried there (accepted with the design, 2026-11-09)

## Relations

- part_of [[Hub Architecture]]
- see_also [[Hub Commands]]
- see_also [[Hub Outside State]]
- see_also [[Hub Browser Surface]]
- see_also [[Hub Tests]]
