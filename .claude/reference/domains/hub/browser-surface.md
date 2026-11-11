---
title: Hub Browser Surface
type: note
permalink: hub/browser-surface
tags: ["http", "auth", "launch-token", "csp", "trusted-types", "polling", "snapshot", "api"]
verified: 2026-11-11
coverage: partial
sources:
  - "src/server/main.ts"
  - "src/server/http/browser.ts"
  - "src/shared/api.ts"
  - "src/web/ui/client.ts"
  - "src/web/logic/poll.ts"
  - "src/web/logic/connection.ts"
  - "src/web/logic/snapshot.ts"
measured_on: "Chrome 157, Node 26.13.0, on Linux under WSL2"
---

# Hub Browser Surface

> **Scope.** How the hub starts, how a browser proves it may read and act, the checks and headers on every request,
> the HTTP API with its `Snapshot` type, and how the page polls, as agreed with the owner on 2026-11-08 and 2026-11-09
> before any hub code existed. On #24 the launch, token, `GET` check, header, CSP and polling lines were checked
> against the sources listed. On #PRNUM the 500 path, the `Snapshot` and `SessionView` types, the page's snapshot
> reader and the line numbers cited were checked again; the other lines checked on #24 were carried forward without a
> re-read. The `POST` checks, `POST /api/commands`, the `commands`, `usage`, `activity`, `contextPercent` and
> `sandboxProblem` fields and the `202` reschedule are design the code does not hold yet, carried forward unchecked.
> The measured lines were taken on 2026-11-08 while designing and were not re-run, except the `100 Continue` line,
> taken on 2026-11-11. Not covered: the browser code's own rules ([[Hub Browser Code]]), how the sessions in a
> snapshot are read and built ([[Hub Outside State]]), what a command does once queued ([[Hub Commands]]), and the
> socket the plugins use ([[Hub Plugin Socket]]), which has none of these checks.

Read this before touching `src/server/http/browser.ts`, `src/server/main.ts`'s startup, `client.ts`, or any response
header.

## Observations

### Launch

- [decision] The browser proves itself with a launch token, not a cookie (owner, 2026-11-08)
- [decision] The hub refuses to start when stdout is not a terminal, with no override: a hub with no link serves
  nobody while every session with the plugin connects to it, and printing the link would put the token in an agent's
  transcript (owner, 2026-11-08)
- [invariant] `npm start` makes a random 32-byte token held only in memory and prints
  `http://127.0.0.1:<port>/#t=<token>` once. Tests and the fixture script call `start(config)` instead. `npm start`
  and the fixture script print the link from one function, whose output a test reads back with the page's
  `readLaunchHash` (`launchLink`, `src/shared/api.ts:8`)
- [fact] A script run through `npm start` saw a terminal on stdout under a pty and none when piped, `--port` reached
  it, and `import.meta.main` was true when run and false when imported #measured (2026-11-08)
- [invariant] The port is fixed so the origin and the saved token stay put across restarts: 47821, or `--port <n>`.
  A busy port refuses to start and says so
- [invariant] The token lasts for the run; a restart makes a new one and the page says to open the new link

### The token in the browser

- [invariant] `client.ts` handles `#t=` on load and on `hashchange`: it replaces the hash with `#/`, sends
  `GET /api/snapshot` with the candidate, and saves it to `localStorage` only on a 200. On a 401 it keeps the stored
  token and says only "Invalid token.", since it cannot tell a stale link from a forged one. A `#t=` value that is
  not base64url gets the same notice and sends no request (`takeLaunchLink`, `src/web/ui/client.ts:56`)
- [fact] A page on another origin navigating a hub tab to `#t=x` signed out a tab that saved the token first, and
  left a tab that verified first at 200 with its token unchanged #measured (private Chrome, 2026-11-08)
- [invariant] Every `/api/*` request sends `Authorization: Bearer <token>`. The server hashes both sides and compares
  them in constant time, because `timingSafeEqual` throws on unequal lengths
- [invariant] No credential is attached automatically, so a cross-site or other-port page has nothing to borrow
- [invariant] The page and its assets hold no data and need only the `Host` check; an API request without the token
  gets 401

### Every request

- [invariant] Check order: exact `Host` (`127.0.0.1:<port>`), route, then for `/api/*` the token. For a `POST`:
  exact `Origin`, `Content-Type: application/json`, a 64 KiB body cap, then the schema #order-dependent
- [fact] As built, a wrong `Host` answers 421, an unknown path 404 whatever the method, a method other than `GET` on
  a known path 405 with `Allow: GET`, and a missing or wrong token 401 with `WWW-Authenticate: Bearer`, in that order.
  No route accepts a `POST` yet (`reply`, `src/server/http/browser.ts:126`)
- [invariant] The route is matched on the raw path before `?`, never a normalised one, so only a path spelled exactly
  as a route matches it
- [fact] `curl.exe` on the Windows side reached a server bound to `127.0.0.1` in WSL2 and sent
  `Host: 127.0.0.1:<port>` #measured (2026-11-08)
- [invariant] A throw in a handler, or a rejected snapshot, is caught per request and answers 500
  (`handleBrowserRequest`, `src/server/http/browser.ts:142`)
- [invariant] Logs and error messages name fields, never board text or other values
- [fact] The 500 log holds the matched route's fixed path, else "an unrouted path", the error's `name` and `code`,
  each only when it is a plain identifier, and the stack's `at` lines, never the message or the stack's opening
  lines (`failureDescription`, `src/server/http/browser.ts:90`)
- [risk] The frame filter keeps any stack line that starts with whitespace and `at `, so a multi-line message holding
  such a line would be logged; not seen
- [invariant] Every response carries the CSP below, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
  and `Cache-Control: no-store` (so board text is not cached on disk). There are no CORS headers
- [trap] Node answers some requests itself, with none of these headers. One it cannot parse (400), with headers or
  chunk extensions over its limits (431, 413) or stalled past its timeout (408) goes to a `clientError` listener
  when there is one: the hub's answers the same status with these headers and then destroys the socket, as Node
  does, since a half-open socket outlives `end` (`createClientErrorHandler`, `src/server/http/browser.ts:64`)
- [trap] Node also answers an HTTP/1.1 request with no `Host` (400) and an `Expect` other than `100-continue` (417)
  without emitting `request`. The hub sets `requireHostHeader: false` and listens for `checkExpectation`, so both
  reach the handler's checks; a missing `Host` gets 421 (`start`, `src/server/main.ts:47`)
- [fact] `Expect: 100-continue` still gets Node's bare interim `100 Continue` before the handler's reply #measured
  (Node 26.13.0, 2026-11-11)

```
default-src 'none'; script-src 'self' 'sha256-<import map>'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'
```

- [invariant] The import map's SHA-256 is computed at startup and placed in `script-src`; browsers accept an import
  map only inline

### HTTP API

| Route | Result |
|---|---|
| `GET /` | The page, with the import map |
| `GET /assets/...`, `GET /vendor/...` | An exact match in the asset table, or 404 |
| `GET /api/snapshot` | 200 with `Snapshot` |
| `POST /api/commands` | 202 `{ commandId }`; 409 `{ reason }` when the check against current state fails; 422 for a bad shape |

```ts
type Delivery = 'sending' | 'sent' | 'seen' | 'failed'
type Snapshot = {
  runId: string
  now: number
  sessions: SessionView[]
  commands: CommandView[]
  usage: { kind: string; percentUsed: number; resetsAt?: string }[]
  errors: SourceError[] // { source, sessionId?, message }
}
type SessionView = {
  key: string; sessionId?: string; shortId?: string; name?: string
  cwd: string; kind: string; startedAt: number; isProcessAlive: boolean
  status?: string; state?: string; waitingFor?: string // as listed, since the CLI can add values
  mode?: 'present' | 'distracted' | 'away'; sandboxProblem?: string
  decisions: DecisionView[]; ownerTasks: OwnerTaskView[]; tasks: TaskView[]
  activity?: ActivityView[]; contextPercent?: number
  needsYou: boolean; hasUnreadAnswers: boolean; canAnswer: boolean; canSetMode: boolean
}
type DecisionView = {
  id: string; rev: number; createdAt?: number
  question: string; context?: string
  options: { label: string; description?: string }[]; recommended?: number
  askedBy?: string; plugin?: string; isAnswerKept: boolean
  answer?: string; chosenOption?: string; note?: string; delivery?: Delivery // once answered
}
type OwnerTaskView = {
  id: string; rev: number; createdAt?: number
  title: string; description?: string; postedBy?: string
  items: { label: string; isTicked: boolean }[]
  isStartPressed: boolean; isDone: boolean
  lastChange?: { summary: string; delivery: Delivery }
}
type TaskView = {
  id: string; title: string; status: string; note?: string; holderId?: string
  items: { label: string; isTicked: boolean }[]
}
type ActivityView = NonNullable<Report['activity']>[number] // Report is in the plugin socket note
type CommandView = {
  id: string; sessionId: string; kind: string; itemId?: string
  state: 'queued' | 'handed' | 'applied' | 'rejected' | 'notPickedUp' | 'noResult' | 'sessionGone'
  reason?: string
}
```

- [fact] As built, `Snapshot` holds `runId`, `now`, `sessions` and `errors`, and `SessionView` holds every field
  above except `sandboxProblem`, `activity` and `contextPercent`; `commands`, `usage` and those three are design
  (`SessionView`, `src/shared/api.ts:64`)
- [invariant] `needsYou` is decided by the hub, so the browser groups cards without knowing the rule; the rule is in
  [[Hub Outside State]]
- [invariant] `runId` is constant for a run; when it changes the page reloads to get the new code. It is read and
  compared before the rest of the body is narrowed, since a restarted hub may serve a shape the old page rejects
  (`readRunSnapshot`, `src/web/logic/snapshot.ts:173`)
- [invariant] The page narrows the body by hand, field by field: only named fields are copied, an absent optional
  field stays absent rather than `undefined`, and a value that does not fit throws naming its path, such as
  `snapshot field sessions entry 0 field mode` (`objectOf`, `src/web/logic/snapshot.ts:58`)
- [invariant] Relative times count from the snapshot's `now`, not the browser's clock, because WSL2's clock can lag
  the host's after sleep

### Polling

- [decision] The browser polls; there is no push channel. Each request triggers the hub's reads, so no tab open means
  no background work (owner, 2026-11-08)
- [invariant] `client.ts` fetches `GET /api/snapshot` with chained `setTimeout`, one request at a time: every 2 seconds
  while visible and every 30 seconds while `document.hidden`, the interval chosen by a pure function in `logic`
- [invariant] The visibility event and a `202` reschedule the same loop rather than starting a second fetch
- [invariant] Every request uses `AbortSignal.timeout(8000)`; `fetch` has no default timeout, so one hung request
  would end a chained loop for good #silent-failure. The 8 seconds outlasts the 5 second `claude agents` timeout in
  [[Hub Outside State]], which a request waits on only until the hub has read its first list
- [invariant] The 30 second hidden interval is the hub's own choice: Chrome does not slow this loop, see
  [[Chrome Hidden Tab Timers]]. Without it a dashboard left up costs about 5% of a core all day
- [invariant] Every poll dispatches with no `ETag`: Preact changes no DOM when nothing changed, and rendering costs
  under 1 ms at a realistic size
- [invariant] Connection state lives in the reducer: `loading`, `live`, `stale`, `signedOut`. A failed or timed-out
  fetch shows "hub not responding" and keeps the last snapshot, marked stale. A 401 keeps the page and its state,
  shows a banner and keeps polling, re-reading the token each time, so opening the new link in any tab recovers every
  tab
- [invariant] The worst-case age of what is on screen is about 5 seconds while visible

### Accepted risks and open questions

- [risk] Token at rest: it sits in the browser profile and in terminal scrollback for the run. Script injection could
  read it but could already act as the owner while the page is open, and a remote page cannot pass the `Host` and
  `Origin` checks or a preflight (accepted with the design, 2026-11-09)
- [risk] A process running as the owner outside the sandbox can start the real hub under a fake terminal; the
  terminal check keeps honest agents honest only (accepted with the design, 2026-11-09)
- [risk] An agent driving the owner's own browser, such as Claude in Chrome, acts with the owner's profile and so the
  saved token, and can press the hub's buttons where the owner granted it the site (accepted with the design,
  2026-11-09)
- [question] A real browser on the Windows side, and clicking the link from a terminal, were not tried
- [question] Anything on macOS was not tried; every measurement here is on Linux or WSL2

## Relations

- part_of [[Hub Architecture]]
- depends_on [[Chrome Hidden Tab Timers]]
- see_also [[Hub Browser Code]]
- see_also [[Hub Commands]]
- see_also [[Hub Plugin Socket]]
