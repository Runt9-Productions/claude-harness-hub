---
title: Hub Skeleton Decisions
type: note
permalink: projects/hub-skeleton/decisions
tags: ["skeleton", "scope"]
---

# Hub Skeleton Decisions

Rulings for the first slice. The design itself is in the hub notes under `domains/hub/`.

## Decisions

- [decision] The first pull request holds the server shell and the Preact page together, because it lays the
  groundwork for both sides; it is reviewed by `lens-review` rather than by the owner's own architecture review
  (owner, 2026-11-11)
- [decision] Preact 11.1.1, installed now rather than waiting two days for the measured 11.2.0; the verifier checks it
  under the CSP (owner, 2026-11-11)
- [decision] The owner's CI commit goes on this pull request, so `gate` covers everything that merges (owner,
  2026-11-11)
- [decision] The issue text in [[Hub Skeleton Spec]] is posted as written (owner, 2026-11-11)
- [decision] The run may write `src/`, `scripts/`, `tsconfig.json`, `.oxlintrc.json`, `package.json` (scripts only,
  Preact through the owner's install), `.gitignore`, `.prettierignore`, `CLAUDE.md` "Checks",
  `.claude/development-profile.md` section 9 and `.claude/reference/`, and may commit, push and open the draft pull
  request without asking each time (owner, 2026-11-11)
- [proposal] No validator in this slice: no route takes a request body yet, so `zod` arrives with `POST /api/commands`
  and the session sources (open)
- [proposal] The fixture script's stub `claude` exits non-zero with a message, since nothing in this slice runs it;
  the session list slice gives it fixture output (open)
- [proposal] `src/shared` holds the API paths as its runtime value, used by both the server routes and the client,
  so it is a file a test loads (open)

- [decision] The bot commits the owner's Preact install in `package.json` and `package-lock.json`, with the `start`
  script, alongside task 02, since the pre-push hook takes only the bot's commits (owner, 2026-11-11)

- [decision] `fixture-main.ts` refuses to start unless `HOME` and `CLAUDE_CONFIG_DIR` sit under the temporary
  directory, so a direct run cannot reach the real config dir once the hub reads one (owner, 2026-11-11)

## Open Questions

- [question] Whether the refused-link notice keeps saying the link is "from an earlier run", which is false for a
  forged link, or says only that the running hub did not accept it
