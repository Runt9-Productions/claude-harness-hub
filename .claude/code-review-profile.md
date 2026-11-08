# Code review profile

Facts about this repository that `/lens-review` needs. The reviewer reads every section; each lens names the sections
it judges against.

## What ships, and why a defect is expensive

A public, MIT-licensed local web app that runs as its user, reads `~/.claude`, and can make Claude Code sessions act
by answering their decisions through a file inbox. A page in the user's browser that gets the hub's authority can
answer every decision in every session, so the browser surface and every reader of outside state are security
boundaries. The hub is released to npm and runs on other people's machines, so a malicious dependency or release
runs as each of them. Everything merged is public, and git history keeps whatever was pushed.

## Fetching the diff

| Target | Command |
|---|---|
| Working tree | `git diff HEAD` (staged and unstaged changes, and new files once staged) |
| Commit | `git show <sha>` |
| Range | `git diff <a>..<b>` |
| Pull request | `gh pr diff <n>`, then `gh pr view <n> --json commits,body` for the commit messages and the description |

- `gh` authenticates with `GH_TOKEN`, set in the shell that runs each `gh` call.
- Default branch: `main`.
- No path is excluded from review. `package-lock.json` is relevant only to `guardrails` and `public-leak`.

## Output

- Root: `$CODE_REVIEW_OUTPUT` when it is set, otherwise `.claude/output/code-review/`.

## Lenses

Default: `correctness`, `code-health`, `simplification`, `staleness-and-debris`, `public-leak`. `auto` applies every
lens whose routing row matches, then any other the reviewer judges the change needs.

The three threat lenses (`guardrails`, `browser-surface`, `server-input`) come from the hub's threat model, not from
defects found here; none has been found yet. Each is re-cut once real findings show what it misses.

Routing, binding under `auto` when the diff matches:

| Lens | Matches |
|---|---|
| `public-leak` | any change |
| `test-quality` | any test file added or changed |
| `guardrails` | anything under `.github/`; `.npmrc`; `package.json`; `package-lock.json`; `tsconfig.json`; `.oxlintrc.json`; `.prettierrc.json`; `.prettierignore`; `.claude/`; `CLAUDE.md`; a release or update path |
| `browser-surface` | code that serves HTTP, sets a response header, checks a request, handles the launch token or cookie, or renders board text in the browser |
| `server-input` | code that reads `claude agents --json`, the board store, presence files or inbox results; builds a path; starts a process; or writes the inbox |

## Severity calibration

The scale is Critical (Must Fix), High (Should Fix), Normal (Could Fix). Reference points for this repo:

- **Critical**: the app's main path breaks or gives a wrong result, such as an answer that never reaches its session
  or a session shown in the wrong state; a page on another origin, or board text, that can make the hub act; a path or
  process argument an outside value can steer; private information anywhere in the diff; a CI check that runs and
  checks nothing.
- **High**: an ordinary but less common path breaks, such as a session ending mid-answer or an empty board; outside
  data used without validation, or defaulted when its shape is unknown; a dependency added without the owner's
  install; a config change that loosens a check without saying so.
- **Normal**: a path only an unusual setup reaches; leftover debug output; history in a comment; a missing line in a
  living doc.

Adding code is not free. A Normal is optional: the author may decline one with a one-line reason. A finding whose only
fix is a guard for a case no honest change or common mistake reaches is not reported, except under the three threat
lenses, where hostile input is the case. A finding that removes code is worth as much as one that adds it.

## Fragile spots CI does not catch

- `gate` is the only required check. A path filter or trigger change that stops the workflow starting means `gate`
  never reports and the PR waits forever. A new job left out of `gate`'s `needs` can fail without blocking a merge.
- `node --test` passes with no test files, so CI counts them first. Coverage counts only files some test loads, so CI
  checks that every server and shared source file is in the lcov report; widening the source tree beyond those globs
  needs the step changed too.
- An inline `oxlint-disable` comment can switch off any rule, the bans on `any` and `@ts-` comments included; no
  option forbids it. CI reports only unused ones.
- Every config CI reads, other than the workflow, is bot-editable: `tsconfig.json`, `.oxlintrc.json`,
  `.prettierignore` and `package.json`. A change that loosens one passes CI.
- `.leak-scan.toml` is read from the base branch, so a new allowlist entry takes effect only after it merges.
- The harness commit CI runs its guards from is pinned by hand in `HARNESS_SHA`; nothing raises it.
- A comment that points readers at a gitignored path (`.claude/output/`), which no other clone has.

## Living docs

| Doc | Must change when |
|---|---|
| `CLAUDE.md` | layout, checks, code rules or the "Writing here" rules change |
| `README.md` | installing, starting or updating the hub works differently |
| `.claude/development-profile.md` | how the repo is built, checked, verified, committed or reviewed changes |
| `.claude/test-review-profile.md` | a test kind, helper, run command or suite rule changes |
| this profile | a CI check is found to fail silently, a lens is re-cut, or something is ruled not to be a finding |

## Mirrors

| Copy | Source | Kept in step by |
|---|---|---|
| the check commands in `CLAUDE.md` | the `checks` and `tests` jobs in `.github/workflows/ci.yml` | hand |
| a `# vX` comment beside a pinned action | the SHA it annotates | Dependabot |
| `node-version` in `ci.yml` | `engines.node` in `package.json` | hand |

## Companions

- A new source file under the server or shared code brings a test that loads it, or CI fails.
- A new reader of outside state brings validation of what it reads, and a test with a malformed input.

## Test-quality traps

The test references are in `.claude/agents/references/`: `test-review-node-test.md`.

- A fixture copied from a real board store, session list or transcript, rather than written by hand.
- A test that points the hub at the real `~/.claude`.

## Debris

- `console.log` left in for debugging.
- A focused (`only`) or skipped test.
- A real home directory, session id or machine name in a fixture.
- Commented-out code.
- A TODO or FIXME added in passing, unrelated to the change.

## Rulings that are not findings

Each was decided by the owner. Report one only when the diff brings something the ruling did not account for.

- The GitHub org and repository names, the publisher name "Runt9 Productions", the `runt9-claude-bot[bot]` name and
  the GitHub noreply addresses that go with them.
- The owner's own name as a commit author or committer, with their GitHub noreply address. (2026-11-08)
- Runners pinned to `ubuntu-24.04`.
- The required `gate` check not being pinned to a source app: the bot has no permission to write statuses or checks.
- The full harness commit hash in `HARNESS_SHA`.
- Other processes running as the same OS user, which can already write the board store and the inbox. The plugins
  validate every command.
- Guardrail config changes reported in review rather than failed by CI.

## Other callers

Both run the `public-leak` lens alone through the installed harness's `leak-scan/review.sh`, as an agent whose
instructions are the whole lens file, with only `Read`, in a directory holding the inputs and copies of the lens, the
reviewer brief, this profile and `CLAUDE.md` from the default branch, named `public-leak.md`, `reviewer-brief.md`,
`code-review-profile.md` and `CLAUDE.md`. The agent's model is the one `.claude/agents/lens-review/lens-review.md`
names on that branch.

- **The pre-push leak gate** asks for a review of what a push would publish. Its inputs are `commits.patch`,
  `identities.txt`, `file-names.txt`, `binary-files.txt`, `tags.txt` and `ref-names.txt`, and it asks for an open
  question for each binary file.
- **The text check** (`review-text.sh`) asks for a review of an issue or pull request before it is posted. Its one
  input is `body.md`, the title on its first line and the body after it.

`review.sh` adds to either request: lines over 4000 characters are split into pieces of 4000 that overlap by 200,
where the copies are, that every input is read to its last line and the last line read of each reported, and that the
answer goes in the structured output.

## Delivery

- **The report.** Write the complete report to `<review-dir>/review.md` and nowhere else. A run that writes no report
  says why in its final message.
- **The run never posts.** The session that started it posts afterwards (`.claude/development-profile.md`, section
  9).
- **PR targets** also write `<review-dir>/review-payload.json`, posted as written with `event: "COMMENT"` added:
  - `commit_id`: the 40-hex head SHA the diff was fetched at.
  - `body`: the review summary, keeping all three severity headings; a finding placed inline appears there as a
    one-line pointer to its comment.
  - `comments[]`: each with `path`, `line`, `side: "RIGHT"` and `body`, carrying one whole finding, and no other
    field. `line` is the new-side line number counted from the hunk header.
- **Body cap.** Keep `body` under 60,000 characters. When the full body would pass that, shorten every finding in it
  to one line with its location.
- **Fallback.** GitHub rejects the whole review when one comment does not land on the diff, and `review.md` is then
  posted alone as the body, so it holds every finding in full.

## Standing instructions

`code-health` and `simplification` judge the change against the "Code rules" and "Writing here" sections of
`CLAUDE.md` and the installed style-guide skills: `code-style`, `comment-style` and `typescript-style`.
