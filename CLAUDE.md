# claude-harness-hub

A local web app on `127.0.0.1` that shows every running Claude Code session on this machine (its status, its board
and its away mode) and lets the owner answer a session's pending decisions from the browser. Answers reach a session
through a file inbox that the `board` and `away` plugins read. Public and MIT: nothing from an employer, a private
project or a specific machine goes in, in code, comments, docs, tests, commit messages or pull request text.

## Layout

- `src/`: the hub. Its modules and the rules between them are set by the architecture, agreed before the first
  slice; this section names them once they exist.
- `.github/workflows/ci.yml`: CI, ending in `gate`, the one required check. The guard scripts, the leak scan and the
  knowledge base validator run from runt9-claude-harness at the commit `HARNESS_SHA` pins there.
- `package.json`, `package-lock.json`, `.npmrc`: the pinned toolchain. `tsconfig.json`, `.oxlintrc.json`,
  `.prettierrc.json`, `.prettierignore`: its configuration.
- `.claude/`: the profiles, review lenses and agents the `develop`, `lens-review` and `test-review` plugins read.
- `.claude/reference/`: this repo's knowledge base, in the reference-kb plugin's format. Read the note covering an
  area before its code or tool behaviour; a question it does not answer is still open.

## Checks

Run `npm ci` once, then from the root:

```
npx tsc -p tsconfig.json
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
- **Browser surface.** Bind `127.0.0.1` only. Every request checks `Host` exactly and the launch cookie; every change
  is a `POST` with the hub's own `Origin` and a JSON body. No CORS headers. Every response carries the strict CSP
  with Trusted Types. Board text is always rendered as text, never as markup.
- **Input.** Everything from outside the process (HTTP bodies, `claude agents --json`, the board store, presence
  files, inbox results) is validated where it enters, and an unknown shape is a visible error, never a default.
- **Paths and processes.** Paths come only from fixed roots plus validated segments, checked again to sit under the
  root. Child processes run through `execFile` with fixed arguments, never a shell. The hub never opens
  `~/.claude/sessions/`.
- **Inbox writes** go to a temporary name created exclusively, then are renamed into place, in directories with mode
  `0700`.

## Owner's review

Changes to `.github/`, this file, `.claude/` profiles, lenses and agents, `.npmrc`, `package.json`,
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
