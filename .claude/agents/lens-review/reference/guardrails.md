# Lens: guardrails

Asks whether a diff weakens what keeps the hub's code checked and its supply chain closed: CI that checks less, a tool config loosened, a dependency or install path that lets outside code run, or a release path someone else could use; covers `.github/`, the tool configs, `.npmrc`, the package files, `.claude/` and release code.

## The question

After this change, does CI still check everything it checked before, and can any code run on the owner's machine,
or on a user's, that the owner did not choose to install?

## Before the diff

Read "What ships, and why a defect is expensive", "Fragile spots CI does not catch" and "Rulings that are not
findings" in `.claude/code-review-profile.md`, and the "Code rules" and "Owner's review" sections of `CLAUDE.md`.

## In scope

Build the bypass rather than describing a worry. Try:

- **Checks that check less.** A `tsconfig.json` option relaxed or a file left out of `include`; an oxlint rule or
  category turned off, an `overrides` entry, or an inline disable comment; a Prettier ignore that grows; a test
  skipped, deleted or renamed out of CI's glob; a coverage glob that no longer reaches a source directory.
- **CI itself.** Triggers, permissions and secrets in workflows; a job left out of `gate`'s `needs`; a step that
  passes when it finds nothing to check; a tool run through a package script a PR can rewrite. zizmor already audits
  workflows, so report only what it would miss.
- **Dependencies.** Any line added to `dependencies` or `devDependencies`, a version range instead of an exact pin, a
  lockfile change that pulls in a package the diff does not name, a `resolved` URL off the npm registry, install
  scripts, or `.npmrc` losing `ignore-scripts` or `min-release-age`. A dependency change not marked as the owner's
  install is High.
- **Release and update.** Any path that publishes, installs or restarts the hub from inside the hub, which must not
  exist, and any change to who can trigger a release.
- **Agent instructions.** A change to `CLAUDE.md`, a profile, a lens or an agent file that tells an agent or a
  reviewer to skip, pass or loosen a check.

## Out of scope

Leaks belong to `public-leak`, the HTTP surface to `browser-surface`, readers of outside state to `server-input`.

## How far to read

Read every changed config and workflow file whole, and the CI step that reads each changed config. For a lockfile
change, list every package added or changed and where it is resolved from.

## Severity

Every finding names what now goes unchecked or what code can now run, and the line that allows it. A suspicion you
cannot make concrete is an open question, stating what would settle it.

Critical when a check stops checking with CI still green, or outside code can run at install or start. High when a
check is loosened without the pull request saying so, or a dependency changes without the owner's install. Normal for
hardening with no bypass you can show.
