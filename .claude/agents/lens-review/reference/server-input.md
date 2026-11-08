# Lens: server-input

Tries to steer the hub with what it reads from outside its own process (request bodies, `claude agents --json`, the board store, presence files, inbox results), asking whether a value can reach a path, a process argument or an inbox command unchecked, or be trusted in a shape nobody validated.

## The question

Can a value from outside the process choose a file the hub reads or writes, an argument a process gets, or a command a
session acts on, or be used before its shape was checked?

## Before the diff

Read "What ships, and why a defect is expensive", "Fragile spots CI does not catch" and "Rulings that are not
findings" in `.claude/code-review-profile.md`, and "Code rules" in `CLAUDE.md`, whose "Input", "Paths and processes"
and "Inbox writes" items are the contract this lens judges against. Other processes running as the same user are out
of scope by ruling.

## In scope

Build the input that gets through. Try:

- **Paths.** A session id or any segment with `..`, `/`, a NUL byte, or an absolute path; a segment validated once
  and used after a later change; a resolved path not checked again against its root; a symlink planted at a write
  target; a read of `~/.claude/sessions/`.
- **Processes.** `exec`, a shell, or `shell: true` anywhere; an argument built from outside text; a binary looked up
  on a `PATH` an outside value can change.
- **Validation.** Data used before it is parsed against a schema; a schema that accepts extra or missing fields the
  code then trusts; `JSON.parse` output used directly; an unknown shape turned into a default instead of an error.
- **Commands.** An inbox command written without checking current state (the decision exists, is unanswered, the
  option is one of its labels); a command id taken from the request rather than made by the server.
- **Inbox writes.** A write not created exclusively, not renamed into place, or into a directory wider than `0700`,
  so a reader sees half a file or follows a link.

## Out of scope

The HTTP surface's own checks belong to `browser-surface`; CI and dependencies to `guardrails`.

## How far to read

Follow each outside value from the call that reads it, through validation, to every path, argument and write it
reaches.

## Severity

Every finding gives the input that gets through and the line that lets it. A suspicion you cannot turn into one is an
open question, stating which input would test it.

Critical when a request can steer a path, a process or a command. High when a value from a file the hub reads is used
unvalidated. Normal for hardening with no bypass you can show.
