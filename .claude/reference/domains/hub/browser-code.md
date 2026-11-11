---
title: Hub Browser Code
type: note
permalink: hub/browser-code
tags: ["preact", "frontend", "build", "assets", "css", "reducer", "import-map", "route", "waiting-list"]
verified: 2026-11-11
coverage: partial
sources:
  - "src/web/tsconfig.json"
  - "src/server/http/assets.ts"
  - "src/server/main.ts"
  - "src/web/ui/main.tsx"
  - "src/web/ui/client.ts"
  - "src/web/ui/page.tsx"
  - "src/web/ui/dashboard.tsx"
  - "src/web/ui/waiting.tsx"
  - "src/web/ui/later.ts"
  - "src/web/logic/dashboard.ts"
  - "src/web/logic/page-state.ts"
  - "src/web/logic/route.ts"
  - "src/web/logic/waiting.ts"
  - "src/web/styles.css"
  - ".oxlintrc.json"
  - ".gitignore"
  - "package.json"
measured_on: "Preact 11.2.0 and 11.1.1, Chrome 157, Node 26.13.0, oxlint 1.90.0, on Linux"
---

# Hub Browser Code

> **Scope.** How the page is built and served, and the rules for its state, routes, layout stability, error handling
> and CSS, as agreed with the owner on 2026-11-08 and 2026-11-09 before any hub code existed. On #24 the build,
> serving, root error handling, CSS file and lint lines were checked against the sources listed; on #26 the error
> boundary, UI state, dashboard order and list stability lines were checked against the dashboard; on #7 the route,
> page state, open row, waiting list, disabled control and list stability lines were checked against the route, page
> state and waiting list code, and the root boundary and CSS file lines again. The other #24 and #26 lines were
> carried forward without a re-read. Commands, the session route, note drafts and commands in flight, the
> 1.5 second guard and holding rows under the pointer are design the code does not hold yet, carried forward
> unchecked. The Preact 11.2.0 lines were measured on 2026-11-08 while designing and not re-run. Not covered: polling,
> the token and the CSP itself ([[Hub Browser Surface]]), the waiting list's order ([[Hub Outside State]]), and the
> interface's look ([[Hub Style Guide]]).

Read this before touching anything under `src/web/`, the asset table in `src/server/http/assets.ts`, or the browser
build.

## Observations

### Build and serving

- [invariant] `tsc -p src/web/tsconfig.json` emits ES modules to `dist/browser/`, with `jsx: react-jsx`,
  `jsxImportSource: preact`, `rootDir: ".."`, `rewriteRelativeImportExtensions`, and `**/*.test.ts` excluded.
  `dist/` is ignored by git. It extends the root project for the strict flags, with `lib: ["es2025", "dom"]` and no
  Node types
- [invariant] No bundler: `esbuild` would add 26 optional platform packages and an install script to remove one hash
  and one route
- [trap] `tsc` emits even when it reports errors, so `npm start` runs `tsc -p src/web/tsconfig.json && node
  src/server/main.ts` and a type error stops the start #silent-failure
- [invariant] `main.ts` builds paths from `import.meta.url`, never the working directory (`runFromCommandLine`,
  `src/server/main.ts:122`)
- [invariant] Preact is served from the installed package as three files: `dist/preact.mjs`, `hooks/dist/hooks.mjs`
  and `jsx-runtime/dist/jsxRuntime.mjs`. Emitted code and Preact's own files import the bare name `preact`, which
  the page's inline import map resolves. The map is built from the same list as the `/vendor/` URLs (`importMap`,
  `src/server/http/assets.ts:34`)
- [invariant] At startup the server lists `dist/browser/`, `src/web/styles.css`, the Preact files and an SVG icon
  into a `Map` from exact URL to file and content type, and reads the bytes on each request. A request matches a key
  or gets 404, so no request path is ever joined to a directory (`buildAssetTable`, `src/server/http/assets.ts:62`)
- [trap] The table refuses to build on a missing fixed file, a missing `dist/browser/`, a duplicate URL or an
  extension other than `.js`, `.mjs`, `.css` and `.svg`, so a `sourceMap` or `declaration` option in the browser
  build stops every start until its type is added to `contentTypes`
- [invariant] Since the table is built at startup and bytes are read per request, a changed file shows on reload
  with `tsc --watch` in another terminal, and a new file needs a restart
- [fact] Preact 11.2.0 ran from `tsc`-emitted TSX through the import map with the hash and Trusted Types on: hostile
  text rendered as text and its script did not run; hooks, handlers, a `style` object, an external stylesheet and a
  typed draft surviving a new snapshot all worked #measured (2026-11-08)
- [fact] Preact 11.2.0's files hold `innerHTML` only on the `dangerouslySetInnerHTML` path, and no `eval` #measured
  (read in the package, 2026-11-08)
- [fact] Preact 11.1.1 ran the page from `tsc`-emitted TSX through the import map under the hub's real headers in
  headless Chrome 157, with no console, log or exception event; assigning `innerHTML` in the page threw "This
  document requires 'TrustedHTML' assignment" #measured (2026-11-11)
- [fact] Preact 11.1.1's types pass `tsc -p src/web/tsconfig.json`, which inherits the root project's strict flags
  and `skipLibCheck` #measured (2026-11-11)
- [fact] Preact 11.1.1's three served files hold `innerHTML` only on the `dangerouslySetInnerHTML` path, and no
  `eval` or `new Function` #measured (read in the package, 2026-11-11)

### State

- [invariant] The snapshot is replaced whole and lives in one `useReducer` at the root, passed down as props. No
  state library or signals
- [invariant] UI state (open row, expanded cards, note drafts, commands in flight) lives in the same reducer apart
  from the snapshot; a new snapshot never touches it
- [fact] `PageState` is the connection state plus `route`, `expandedCards` (a set of session keys) and `openRow`, and
  no connection event changes those three, so a card keeps its expansion when it moves between groups and remounts
  (`pageReducer`, `src/web/logic/page-state.ts:41`)
- [fact] The reducer holds the owner's choice of open row, not the row: `unchosen`, `chosen` with a row key, or
  `closed`. `openRowKey` in `logic` derives the open row from that choice and the current list on each render: the
  chosen row while it is listed, else the oldest decision, else the oldest owner task. After the owner closes a row
  none opens, new items included, until one is opened (`openRowKey`, `src/web/logic/page-state.ts:58`)
- [fact] The waiting list is built by pure functions in `logic`: `waitingList` takes the items the hub marks
  `isWaiting` from every session into a decision list and an owner task list, each oldest first, and lists sessions
  with `status: waiting` as held lines that are not rows; `waitingTotal` sums every session's `waitingCount` for the
  switcher, so held sessions add nothing (`waitingList`, `src/web/logic/waiting.ts:73`)
- [fact] The viewport width is read in `ui` through a `resize` listener and passed to `columnCount` in `logic`, not
  kept in the reducer, since `logic` may not touch `window` (`useViewportWidth`, `src/web/ui/dashboard.tsx:16`)
- [fact] Each group's column placement is kept outside the reducer too, in `useState` inside its `Group`. Each
  render places the cards against the held placement with `placeInColumns` and sets the state, during render, only
  when the placement changed, so the extra render it causes places the same way and stops. A ref written during render
  or in an effect fails oxlint's `react(immutability)` rule (`useHeldColumns`, `src/web/ui/dashboard.tsx:171`)
- [fact] A `Group` stays mounted while its group is empty, so it keeps its state; with no sessions at all the
  dashboard draws its empty line instead and both `Group`s unmount, which loses nothing, since no card is left to
  hold a column
- [invariant] A command stays in flight until a snapshot contains its id, because a snapshot requested before the
  `POST` can arrive after the `202` #order-dependent
- [invariant] List keys are stable and composite, `<session key>/<kind>/<itemId>`, since item ids restart in each
  session. Focus survives a reorder through `moveBefore`, which Preact 11 uses, and which is why the target is Chrome
  or Edge
- [fact] The waiting list's row keys are `<session key>/decision/<id>` and `<session key>/owner-task/<id>`
  (`waitingRows`, `src/web/logic/waiting.ts:53`)
- [invariant] The route is the URL hash: `#/`, `#/waiting`, `#/session/<key>`. The server has no page routes. A
  session that is not listed shows a message once the first snapshot has loaded
- [fact] `readRoute` maps an empty hash and `#/` to the dashboard, `#/waiting` to the waiting list, and every other
  hash, `#/session/<key>` included, to `unknown`, which draws "This address names no view." with a link to `#/`
  (`readRoute`, `src/web/logic/route.ts:4`; `UnknownRoute`, `src/web/ui/page.tsx:105`)
- [fact] The route lives in the reducer: it is read from `location.hash` for the initial state, and again as a
  `routeChanged` event on each `hashchange` (`App`, `src/web/ui/main.tsx:7`; `startClient`, `src/web/ui/client.ts:35`)
- [trap] `takeLaunchLink` rewrites the hash to `#/` with `history.replaceState`, which fires no `hashchange`, so it
  dispatches `routeChanged` itself. Without that a page opened from the launch link stays on `unknown`, since its
  initial hash is `#t=<token>` #order-dependent (`takeLaunchLink`, `src/web/ui/client.ts:61`)
- [invariant] A disabled button says why, as far as the hub knows: process stopped, or no `hub` plugin connected
- [fact] As built, every control in a waiting row (options, Dismiss, Start, Done, checklist boxes) is disabled with
  the `title` "Arrives in a later release" (`laterReason`, `src/web/ui/later.ts:2`)

### Nothing moves under the pointer

- [invariant] A misclick sends a wrong answer with no undo, so while the pointer or focus is inside a list, items
  already shown keep their slots: one that has left shows its outcome with its buttons disabled, and new ones append.
  The list settles when pointer and focus leave or the screen changes
- [invariant] A row opened by answering the one before it ignores presses for 1.5 seconds, as the pane's keys do
- [invariant] The dashboard sorts by needs-you, then `startedAt`, never by status; this is a pure function in `logic`
  (`groupSessions`, `src/web/logic/dashboard.ts:13`), and the hub sends sessions in the CLI's order
- [fact] The dashboard does not hold slots under the pointer: a card moves between groups on the next snapshot even
  while the pointer is on it, and a session that leaves closes the gap beneath it in its own column. No other card
  changes column (`placeInColumns`, `src/web/logic/dashboard.ts:100`). Its only control, Show more, sends nothing
- [fact] The waiting list does not hold rows either: each render rebuilds and re-sorts both lists from the snapshot,
  so a row moves or leaves under the pointer as items come and go. Every row control is disabled, so nothing can be
  sent from a row that moved (`WaitingView`, `src/web/ui/waiting.tsx:145`)
- [decision] Rows holding still under the pointer come with #11, together with the buttons they protect; until then
  rows move as items come and go (owner, 2026-11-11)

### Errors, CSS and what Preact does differently

- [invariant] `useErrorBoundary` from `preact/hooks` wraps the root and each session card, so one bad session shows
  its error and the rest carry on. Each calls `console.error`, because a caught error reaches no `window` event
  (`Root`, `src/web/ui/main.tsx:14`; `CardBoundary`, `src/web/ui/dashboard.tsx:141`)
- [fact] The waiting list has no boundary of its own, so a throw while drawing any row reaches the root's and
  replaces the whole page with its failure line (`WaitingView`, `src/web/ui/waiting.tsx:145`)
- [invariant] The failure banner is built with plain DOM outside Preact, so it still shows when Preact is what failed
- [invariant] `error` and `unhandledrejection` listeners show a banner for failures outside render; without them a
  throw during render leaves a half-updated page that looks live #silent-failure
- [invariant] CSS is one file, `src/web/styles.css`, with `@layer`, nesting, tokens on `:root`,
  `color-scheme: dark` and a system font stack. No CSS framework, no `<style>`, no string style attributes
- [invariant] Computed values such as a meter's width go through Preact's `style` object, which uses the CSS object
  model and is not blocked by `style-src 'self'`
- [trap] Text inputs use `onInput`: `onChange` fires on commit, and a re-render wipes what is typed
- [trap] Preact style values are strings, because a number gets no `px`
- [invariant] Excluded: a router, `preact/compat`, a component library, Markdown rendering
- [invariant] `dangerouslySetInnerHTML` is banned by lint (`react/no-danger`), and Trusted Types makes it throw if it
  gets through. Board text is only ever rendered as text, never bound to `href` or `src`
- [trap] Naming any plugin in `.oxlintrc.json`'s `plugins` replaces the default list: with `["react"]` alone,
  `typescript/no-floating-promises` set to `error` reported nothing on a floating promise, and with
  `["typescript", "unicorn", "oxc", "react"]` it fired #silent-failure #measured (2026-11-11)
- [risk] Note drafts are lost if Chrome discards a background tab or the page reloads (accepted with the design,
  2026-11-09)

## Relations

- part_of [[Hub Architecture]]
- see_also [[Hub Browser Surface]]
- see_also [[Hub Outside State]]
- see_also [[Hub Style Guide]]
