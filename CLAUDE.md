# claude-harness-hub

A local web app on `127.0.0.1` that shows every running Claude Code session on this machine (its status, its board
and its away mode) and lets the owner answer a session's pending decisions from the browser. Answers reach a session
through a local Unix socket that the optional `hub` plugin holds a request open on, and the plugin passes them on to
the `board` and `away` plugins. Flags from the `watcher` plugin, also in
runt9-claude-harness, arrive as ordinary board decisions. Public and MIT: nothing from an employer, a private project
or a specific machine goes in, in code, comments, docs, tests, commit messages or pull request text.

## Layout

- `src/`: the hub. `shared` holds the snapshot and command types; `server/hub` builds the snapshot, checks commands
  and runs the command queue as pure functions; `server/sources` reads and validates outside state; `server/http`
  serves the browser and socket routes; `server/main.ts` wires them together behind `start(config)`; `web/logic` is
  the browser's pure logic; `web/ui` holds the Preact views and the client; `e2e` holds the browser tests. What each
  may import is in the architecture note, listed in `.claude/reference/README.md`.
- `.github/workflows/ci.yml`: CI, ending in `gate`, the one required check. The guard scripts, the leak scan and the
  knowledge base validator run from runt9-claude-harness at the commit `HARNESS_SHA` pins there.
- `.nvmrc`, `package.json`, `package-lock.json`, `.npmrc`: the pinned runtime and toolchain. `tsconfig.json`, `.oxlintrc.json`,
  `.prettierrc.json`, `.prettierignore`: its configuration.
- `.claude/`: the profiles, review lenses and agents the `develop`, `lens-review` and `test-review` plugins read.
- `.claude/reference/`: this repo's knowledge base, in the reference-kb plugin's format. Read the note covering an
  area before its code or tool behaviour; a question it does not answer is still open.

## Checks

Run `nvm use` and `npm ci` once, then from the root:

```
npx tsc -p tsconfig.json
npx tsc -p src/web/tsconfig.json
npx tsc -p src/e2e/tsconfig.json
npx oxlint -c .oxlintrc.json --type-aware --deny-warnings --report-unused-disable-directives-severity=error src
npx prettier --check --config .prettierrc.json --ignore-path .prettierignore --no-editorconfig .
node --test 'src/**/*.test.ts'
```

CI runs the same commands, adds a coverage threshold, and fails when any server or shared source file is loaded by
no test.

## Code rules

These come from the threat model and hold for every change.

- **Dependencies.** The server has no runtime dependency beyond the one validator the owner approved. Adding,
  removing or upgrading a package is the owner's install, after an evidence packet for it and every package it pulls
  in, gathered with `npm view`, which runs nothing. Never run `npm install`; `npm ci` is allowed.
- **Browser surface.** Bind `127.0.0.1` only. Every request checks `Host` exactly, and every `/api/*` request also
  checks the launch token; every change is a `POST` with the hub's own `Origin` and a JSON body. No CORS headers.
  Every response carries the strict CSP with Trusted Types. Board text is always rendered as text, never as markup.
- **Input.** Everything from outside the process (HTTP bodies, socket requests, `claude agents --json`, the board and
  away stores) is validated where it enters, and an unknown shape is a visible error, never a default.
- **Paths and processes.** Paths come only from fixed roots plus validated segments, checked again to sit under the
  root. Child processes run through `execFile` with fixed arguments, never a shell. The hub never opens
  `~/.claude/sessions/`.
- **Plugin socket.** It sits in a directory checked with `lstat`, owned by this user with mode `0700`. A command
  enters only through the browser API: the socket routes only hand out pending commands and take reports and results.

## Owner's review

Changes to `.github/`, this file, `.claude/` profiles, lenses and agents, `.npmrc`, `.nvmrc`, `package.json`,
`package-lock.json` and the tool configs need the owner's review; say so in the pull request. Nothing in CI blocks
them. The bot cannot push a change under `.github/workflows/`.

## Issues and pull request text

Changes are tracked as GitHub issues in the shape of `.github/ISSUE_TEMPLATE/change.md`: Objective, Technical
details, Out of scope, Acceptance criteria.

- Acceptance criteria are plain bullets stating outcomes, a few at most.
- An issue stands on its own. It never points at `.claude/output`, a session, or anything outside this repository,
  and its examples are synthetic.
- Labels: `bug` or `enhancement`, and `from-review` for a review finding deferred from its pull request. A new label
  that would organize issues better is proposed to the owner before it is used.
- Issues, pull request descriptions and review replies are public the moment they post, and no CI scan reads them.
  Write each to a file, with the title on the first line, and check it from the installed harness
  (`~/.claude/harness/current/leak-scan/`): `review-text.sh <file> . origin/main` for an issue or pull request, and
  `scan.sh --text <file> . origin/main` for a reply. Post only when the check exits 0. Cite commits by their short
  hash: a full one matches the scan's hex-identifier rule.

## Writing here

- Write less: code, comments and docs that are not clearly needed are not written.
- Comments state the mechanism, never the incident that motivated it.
- Docs and knowledge base notes give the rule and a one-line reason, not the story behind it.
- Tests are few, at the boundaries, with obviously synthetic fixtures (`example.com`, invented session ids), never
  copied from a real board store, transcript or session list.
- Nothing comes in from another project, neither its text nor a description of it.
