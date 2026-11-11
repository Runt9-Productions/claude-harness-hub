---
title: Hub Skeleton Spec
type: note
permalink: projects/hub-skeleton/spec
tags: ["skeleton", "file-map"]
---

# Hub Skeleton Spec

What each file in the first slice holds. The rules every file follows are in the hub notes; this map says only what
this slice builds of them.

## Observations

### 01 Server shell

- [invariant] `src/shared/api.ts`: the snapshot type with the fields this slice serves (`runId`, `now`, `sessions`
  empty, `errors`), and the API paths as constants, which the server routes and the client both import
- [invariant] `src/server/http/browser.ts`: the request handler. Exact `Host` of `127.0.0.1:<port>`, then the route,
  then for `/api/*` the bearer token, hashed on both sides and compared in constant time. A wrong `Host` answers 421,
  another method 405 with `Allow: GET`, and a missing token 401 with `WWW-Authenticate: Bearer`. Every response, 404,
  401 and 500 included, carries the CSP with the import map's hash, `nosniff`, `Referrer-Policy: no-referrer` and
  `Cache-Control: no-store`, and no CORS header. No route accepts a `POST` yet
- [invariant] `src/server/http/assets.ts`: the asset table, built once from the asset root: everything under
  `dist/browser/`, `src/web/styles.css`, Preact's three files under `/vendor/`, and the icon. Exact URL to file and
  content type; bytes read per request; anything else is 404
- [invariant] `src/server/main.ts`: `start(config)` with the port and asset root, returning `{ port, token, close }`.
  It makes the 32-byte token and the `runId`, builds the page with its inline import map and module script, and
  serves `GET /api/snapshot` from the shared type. The command-line part, under `import.meta.main`, takes
  `--port <n>` (default 47821), refuses to start when stdout is not a terminal or the port is busy, and prints the
  link once
- [invariant] Tests drive the server over HTTP on a free port: a wrong `Host` (another name, port, no port, trailing dot,
  IPv6 loopback) refused, `/api/snapshot` without or with a wrong token 401 and with the right one 200, the headers on
  every kind of response, the CSP hash matching the page's import map, an unknown path 404 with no file read, and the
  command line refusing a piped stdout
- [invariant] Config: the root `tsconfig.json` excludes `src/web/ui` and `src/e2e` and its comment names Node 26;
  `package.json` gains `start`, which works from task 02 on, once the browser build, styles and icon exist;
  `.gitignore` and `.prettierignore` gain `dist/`

### 02 Browser page

- [invariant] Preact is the owner's install, after an evidence packet; `package.json` gains it as a dependency
- [invariant] `src/web/tsconfig.json` builds `src/web` to `dist/browser/` with the options in [[Hub Browser Code]]
- [invariant] `.oxlintrc.json`: the plugins list with `react` added to the defaults, `react/no-danger`,
  `react/react-in-jsx-scope` off, the import rules per directory from [[Hub Architecture]], and `document` and
  `window` barred in `src/web/logic`
- [invariant] `src/web/logic/`: the poll interval, the connection reducer (`loading`, `live`, `stale`, `signedOut`)
  that replaces the snapshot whole, reading a token out of `#t=`, and `readSnapshot`, which narrows a response body
  to the snapshot type and throws on a body that does not fit, each with `node:test` tests
- [invariant] `src/web/ui/`: `main.tsx` with the root error boundary and the `error` and `unhandledrejection`
  banner; `client.ts` with the token flow (verify, then save), the bearer header, the chained poll with
  `AbortSignal.timeout(8000)`, the visibility reschedule, the 401 banner and the reload on a new `runId`; a view that
  shows the connection state and that no sessions are listed yet
- [invariant] `src/web/styles.css` and the icon, by the CSS rules in [[Hub Browser Code]]

### 03 Fixture script and docs

- [invariant] `scripts/start-fixture-hub.sh` copies `src/e2e/fixtures/` to a new temporary directory, sets `HOME` to
  it and `CLAUDE_CONFIG_DIR` to its `.claude`, so the `HOME/.claude` fallback agrees, puts a stub `claude` first on
  `PATH`, builds the browser code and runs `src/e2e/fixture-main.ts`, which refuses to start unless both variables
  sit under the temporary directory, calls `start(config)` on a free port and prints the link. Stopping the script
  stops the hub and removes the copy
- [invariant] `src/e2e/tsconfig.json` with DOM and Node types, emitting nothing
- [invariant] Docs: `CLAUDE.md` "Checks" gains the two other `tsc` runs; `.claude/development-profile.md` section 9
  loses "Whether it also runs in CI is being trialled."; the hub notes gain `sources` for the files that now exist,
  and the questions this slice answers are closed

### The owner's CI commit

- [invariant] `.github/workflows/ci.yml`: `tsc -p src/web/tsconfig.json` and `tsc -p src/e2e/tsconfig.json` in the
  `checks` job, and `src/web/logic/**/*.ts` in both coverage globs. The bot cannot push it

## Issue text

The proposed body for #5, in the shape of `.github/ISSUE_TEMPLATE/change.md`:

```markdown
Start the hub from one command and serve its page to the launch link only

## Objective

Give the hub a running skeleton on both sides: one command starts the server and prints a launch link, the link
opens a Preact page that proves itself with the launch token, and every other request is refused. Everything else
builds on this.

## Technical details

Depends on #4.

- Follows the browser surface rules in `CLAUDE.md` and the hub notes in `.claude/reference/`: `127.0.0.1` only, an
  exact `Host` check, the launch token on every `/api/*` request, and the strict CSP with Trusted Types on every
  response
- `GET /api/snapshot` returns a snapshot with no sessions; the page polls it and shows whether it is connected,
  stale or signed out
- The browser code is built with `tsc` into `dist/`, with Preact served from the installed package through an
  inline import map
- Adds `scripts/start-fixture-hub.sh`: copies synthetic fixtures fresh, sets `HOME` and `CLAUDE_CONFIG_DIR` to the
  copy, puts a stub `claude` first on `PATH` and starts the hub on a free port. A verifier starts the hub no other way
- Adds Preact through the owner's install, after an evidence packet, and the extra `tsc` runs and the
  `src/web/logic` coverage glob to CI as an owner workflow commit
- Removes "Whether it also runs in CI is being trialled." from section 9 of `.claude/development-profile.md`

## Out of scope

Reading any session data, the plugin socket, commands, the validator, and browser tests with Playwright.

## Acceptance criteria

- One command starts the hub and prints a link that opens the page, which shows it is connected
- A request with the wrong `Host` is refused, and an `/api/*` request without the token gets 401
- Every response carries the CSP, and the page runs under it with no violation
- `gate` passes on a pull request with real code in `src/`
```
