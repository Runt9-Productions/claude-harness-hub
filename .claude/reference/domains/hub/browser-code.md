---
title: Hub Browser Code
type: note
permalink: hub/browser-code
tags: ["preact", "frontend", "build", "assets", "css", "reducer", "import-map"]
verified: 2026-11-11
coverage: partial
sources:
  - "src/web/tsconfig.json"
  - "src/server/http/assets.ts"
  - "src/server/main.ts"
  - "src/web/ui/main.tsx"
  - "src/web/styles.css"
  - ".oxlintrc.json"
  - ".gitignore"
  - "package.json"
measured_on: "Preact 11.2.0 and 11.1.1, Chrome 157, Node 26.13.0, oxlint 1.90.0, on Linux"
---

# Hub Browser Code

> **Scope.** How the page is built and served, and the rules for its state, layout stability, error handling and
> CSS, as agreed with the owner on 2026-11-08 and 2026-11-09 before any hub code existed. On 2026-11-11, with the
> first slice built, the build, serving, root error handling, CSS file and lint lines were checked against the
> sources listed; the rest (per-card boundaries, UI state, commands, routes other than `#/`, list stability) is
> design the code does not hold yet, carried forward unchecked. The Preact 11.2.0 lines were measured on 2026-11-08
> while designing and not re-run. Not covered: polling, the token and the CSP itself ([[Hub Browser Surface]]), and
> the interface's look, which the owner set outside this repository.

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
  `src/server/main.ts:89`)
- [invariant] Preact is served from the installed package as three files: `dist/preact.mjs`, `hooks/dist/hooks.mjs`
  and `jsx-runtime/dist/jsxRuntime.mjs`. Emitted code and Preact's own files import the bare name `preact`, which
  the page's inline import map resolves. The map is built from the same list as the `/vendor/` URLs (`importMap`,
  `src/server/http/assets.ts:137`)
- [invariant] At startup the server lists `dist/browser/`, `src/web/styles.css`, the Preact files and an SVG icon
  into a `Map` from exact URL to file and content type, and reads the bytes on each request. A request matches a key
  or gets 404, so no request path is ever joined to a directory (`buildAssetTable`, `src/server/http/assets.ts:165`)
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
- [invariant] A command stays in flight until a snapshot contains its id, because a snapshot requested before the
  `POST` can arrive after the `202` #order-dependent
- [invariant] List keys are stable and composite, `<session key>/<kind>/<itemId>`, since item ids restart in each
  session. Focus survives a reorder through `moveBefore`, which Preact 11 uses, and which is why the target is Chrome
  or Edge
- [invariant] The route is the URL hash: `#/`, `#/waiting`, `#/session/<key>`. The server has no page routes. A
  session that is not listed shows a message once the first snapshot has loaded
- [invariant] A disabled button says why, as far as the hub knows: process stopped, or no `hub` plugin connected

### Nothing moves under the pointer

- [invariant] A misclick sends a wrong answer with no undo, so while the pointer or focus is inside a list, items
  already shown keep their slots: one that has left shows its outcome with its buttons disabled, and new ones append.
  The list settles when pointer and focus leave or the screen changes
- [invariant] A row opened by answering the one before it ignores presses for 1.5 seconds, as the pane's keys do
- [invariant] The dashboard sorts by needs-you, then `startedAt`, never by status; this is a pure function in `logic`

### Errors, CSS and what Preact does differently

- [invariant] `useErrorBoundary` from `preact/hooks` wraps the root and each session card, so one bad session shows
  its error and the rest carry on. It calls `console.error`, because a caught error reaches no `window` event. Only
  the root's exists so far (`Root`, `src/web/ui/main.tsx:14`)
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
