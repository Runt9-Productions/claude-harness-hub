# Development profile

What the `develop` skill needs to know about this repository. Where `CLAUDE.md`, `.claude/code-review-profile.md` or
a knowledge base note already answers a question, this file points there.

## 1. Ticket tracker

- GitHub issues on `Runt9-Productions/claude-harness-hub`, in the shape of `.github/ISSUE_TEMPLATE/change.md`;
  `CLAUDE.md`, "Issues and pull request text", has the rules for writing one.
- A review finding deferred from its pull request becomes an issue labelled `from-review`.
- Step 3's setup: the labels `CLAUDE.md` describes. There are no assignment, planning or estimate fields; the estimate
  lives in the spec only.
- Work started: no update.
- Automation: GitHub closes an issue when a pull request whose body names it with a closing keyword (`Closes #<n>`)
  merges into `main`.
- Issue text is public the moment it posts. Check it with `review-text.sh` before posting (`CLAUDE.md`).
- Connection failure: `gh` answers 401 until `GH_TOKEN` is set, and how it is minted is machine-local. File an owner
  task and carry on.

## 2. Branches

- Base: `main`, both as the pull request target and for diffs.
- Naming: `claude/<kebab-case-slug>` naming the change. The bot may push nothing outside `claude/`.
- Lag: `main` accepts a pull request only when its branch is up to date, so merge `main` in before the last push. A
  merge that brings in a change to `.github/workflows/` cannot be pushed by the bot (section 10).
- Trap: `origin/main` and `bot/main` track the same branch through two remotes and go stale separately. Fetch the
  one you compare against.

## 3. Worktree and working directory

- No `.worktreeinclude` and no `worktree.*` settings, so Claude Code's defaults apply. A new worktree needs `npm ci`
  once before any check.
- Renaming the branch: not measured here.
- Shared with the main checkout: the git config, so `core.hooksPath` and the `claude.*` keys apply in every
  worktree.
- Working directory: `.claude/output/<ticket>/` in the checkout the session works in, ignored by the tracked
  `.gitignore`. It is scratch and goes when the worktree does. No comment or doc may point at it.
- Fresh session: yes, started with `claude --worktree <name>`, because a session's language server stays rooted where
  the session started.

## 4. Spec location

- The knowledge base: one project per ticket at `.claude/reference/projects/<kebab-case-name>/`, in the reference-kb
  format plus what `.claude/reference/kb.toml` adds. The entry-point table in `.claude/reference/README.md` lists each
  project.
- Notes are public: generic facts only, as `.claude/reference/README.md`, "Local conventions", sets out.
- Validator: the reference-kb plugin's `validate.py --root .claude/reference`, and the same with
  `--stale-in origin/main..HEAD`. CI runs both from the pinned harness commit.

## 5. Agents

- Implementer `engineer`, verifier `verifier` and research agent `code-researcher` in `.claude/agents/`. Doc writer:
  `reference-kb:kb-writer` for knowledge base notes; the implementer keeps the other living docs in step with the
  code. Comment sweep: `develop:comment-sweeper`.
- After a merge or checkout that changes `.claude/agents/`, a spawn waits until the session reports the updated agent
  types: a teammate spawned before then runs the old definition, with no sign of it.
- Ramp-up: not measured.
- Briefs stay short: teammates load `CLAUDE.md`, so a brief carries the task, its write scope and what they cannot
  discover, and repeats no repo rule.

## 6. Build, test and pre-push

- There is no build step for the server, which Node runs from its TypeScript. The browser code is built with
  `tsc -p src/web/tsconfig.json` into `dist/browser/`, which `npm start` runs first; the browser tests and
  verification need that build, and `node --test` does not. The checks are the commands in `CLAUDE.md`, "Checks".
- Never run locally: none is barred. The coverage step is CI's; run `node --test` with `--experimental-test-coverage`
  to see it.
- Pre-push: the installed `pre-push` hook checks authorship and the branch prefix, then runs the leak scan and a
  `public-leak` review through `claude -p`. Any finding above Normal, or any open question, refuses the push. It scans
  each commit on its own, so a hit is cleared only by replacing the commit that holds it. What CI fails that is
  cheapest to catch first: Prettier, and a note left unverified after its sources changed.
- CI watch: with `GH_TOKEN` set (section 1) and `sha` the pushed commit,

  ```
  while id=$(gh run list --commit "$sha" --workflow CI --json databaseId,createdAt \
      --jq 'max_by(.createdAt) | .databaseId // empty') && [ -z "$id" ]; do sleep 10; done
  gh run watch "$id" --exit-status
  ```

  It waits for the commit's `CI` run to exist, takes the newest because `edited` can start a second run on one head,
  and follows that run until every job, `gate` included, has finished.
- The bot cannot rerun a job, since its App lacks Actions write. Closing and reopening the pull request starts a new
  `CI` run on the same head, since the trigger lists `reopened`.
- Duration: not measured yet.

## 7. Verification

- Method: the `verifier` agent starts the hub only through `scripts/start-fixture-hub.sh`, then drives headless Chrome
  through the chrome-devtools tools to the end state the brief names. The script arrives with the first slice, and
  no verification runs before it does. It copies the checked-in fixtures to a new temporary directory, sets `HOME` and
  `CLAUDE_CONFIG_DIR` to the copy, puts a stub `claude` first on `PATH` and runs `src/e2e/fixture-main.ts`, which
  calls `start(config)` on a free port and prints the link. Every run starts from the same state and the hub cannot
  reach the real `~/.claude` or live sessions, with no test-only path in the hub's code.
- Evidence: the steps, what each showed, and screenshots attached with
  `gh pr comment <n> --body-file <file> --attach '<image>#<alt text>'` (gh 2.99 or newer). No scan reads an image, so
  every image is looked at before it is posted.
- What it cannot show: behaviour with real sessions and the real `hub`, `board` and `away` plugins, which the owner
  tries before merging.

## 8. Shared machine resources

- The hub's port, 47821 by default, and its socket under the config dir. Two hubs on either collide, and a hub on the
  real config dir is the one live sessions connect to. The fixture script's free port and temporary config dir avoid
  both; a verification run says which port it used.
- The real `~/.claude` is the owner's, shared by every session: no test or verification reads or writes it.

## 9. Review

- Code review: the `lens-review` plugin, with `.claude/code-review-profile.md` and the agent and lenses in
  `.claude/agents/lens-review/`, run locally.
- When: the test review and the code review each run once per pull request, when it is first pushed: the test review,
  then the code review over the head that carries its fixes. A later push gets CI only; say what changed and the owner
  decides whether it gets another review. A trivial pull request gets neither and opens ready.
- Test review: `.claude/test-review-profile.md` exists. Run `/test-review` in the pull request's worktree before the
  code review. Skipped when the pull request changes no test.
- Code review: invoke `/lens-review <n> auto` as a skill in the session doing the work, so the owner sees the run:
  never a headless or background run. The session runs in auto mode or with prompts, never a bypass mode.
- Posting: the bot posts the result as one comment-type review from the payload the skill wrote, after checking the
  payload's text and `review.md` with `review-text.sh`. Run the second command only when GitHub rejects the first.

  ```
  jq '.event = "COMMENT"' <run dir>/review-payload.json \
    | gh api repos/Runt9-Productions/claude-harness-hub/pulls/<n>/reviews --input -
  gh api repos/Runt9-Productions/claude-harness-hub/pulls/<n>/reviews -f event=COMMENT \
    -f body="$(head -c 60000 <run dir>/review.md)"
  ```

- Findings: the merge rule is CI green and no open Critical or High. A Normal is optional: fix it, decline it on its
  thread with a one-line reason, or defer it to a `from-review` issue.
- External reviewer: none.
- Public text: pull request bodies and replies say what a change does and why, in terms of the behaviour it targets.

## 10. Commit and push

- Identity: the GitHub App bot, its name and email in `git config claude.botName` and `claude.botEmail`. Commit with
  `TZ=UTC git -c user.name="$(git config claude.botName)" -c user.email="$(git config claude.botEmail)" commit`.
  Every command that writes a commit takes the same `-c` pair.
- Messages and trailers: the trailer lines the harness supplies. A message states the change and its reason.
- Remote: `bot`, the HTTPS remote. `origin` is SSH and the owner's. A push that adds a commit changing
  `.github/workflows/` is refused for the bot's token, so the owner makes that push over SSH.
- Guards: `pre-push` refuses refs outside `claude/` and commits not made by the bot. The remote rules hold: the bot
  pushes only `claude/**`, and `main` takes changes only by pull request with `gate` passing and the branch up to
  date.
- Grant: one grant from the owner at the start of a `/develop` run covers committing, pushing and opening the draft
  pull request for that run only. Outside a run, each commit or push needs the owner's say-so.
- Pull request: `gh pr create --draft --base main --body-file <file>`, then the reviews (section 9). The lead runs
  `gh pr ready <n>` once the review has run, its Critical and High findings are fixed and pushed, and every thread is
  answered. Only the squash-merge is the owner's.

## 11. Hand-off

- The owner tries the change in a real browser against real sessions before merging.
- Nobody reviews after the owner.
