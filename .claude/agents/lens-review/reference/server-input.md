# Lens: server-input

Tries to steer the hub with what it reads from outside its own process (request bodies, socket requests and the reports and results they carry, `claude agents --json`, the board and away stores), asking whether a value can reach a path, a process argument or a command unchecked, or be trusted in a shape nobody validated.

## The question

Can a value from outside the process choose a file the hub reads or writes, an argument a process gets, or a command a
session acts on, or be used before its shape was checked?

## Before the diff

Read "What ships, and why a defect is expensive", "Fragile spots CI does not catch" and "Rulings that are not
findings" in `.claude/code-review-profile.md`, and "Code rules" in `CLAUDE.md`, whose "Input", "Paths and processes"
and "Plugin socket" items are the contract this lens judges against. A process running as the owner outside the
sandbox is out of scope by ruling.

## In scope

Build the input that gets through. Try:

- **Paths.** A session id or any segment with `..`, `/`, a NUL byte, or an absolute path; a segment validated once
  and used after a later change; a resolved path not checked again against its root; a symlink planted at a write
  target; a read of `~/.claude/sessions/`.
- **Processes.** `exec`, a shell, or `shell: true` anywhere; an argument built from outside text; a binary looked up
  on a `PATH` an outside value can change, such as one still holding a `node_modules/.bin` entry.
- **Validation.** Data used before it is parsed against a schema; a schema that accepts extra or missing fields the
  code then trusts; `JSON.parse` output used directly; an unknown shape turned into a default instead of an error.
- **Commands.** A command queued without checking current state (the session has a `sessionId`, a `pid` and a
  connected plugin, the item exists and is unfinished, `rev` matches, the option is one of its labels); a command id
  taken from the request rather than made by the server; a command handed out twice; a socket route that can add or
  change a command.
- **The socket.** A socket directory not checked with `lstat`, not owned by this user or wider than `0700`; a path at
  the socket removed without first finding it is a socket that refuses connections; a report that changes more than
  what is displayed, or an invalid one that stops commands being handed out; a body read past its cap.

## Out of scope

The HTTP surface's own checks belong to `browser-surface`; CI and dependencies to `guardrails`.

## How far to read

Follow each outside value from the call that reads it, through validation, to every path, argument and command it
reaches.

## Severity

Every finding gives the input that gets through and the line that lets it. A suspicion you cannot turn into one is an
open question, stating which input would test it.

Critical when a request can steer a path, a process or a command. High when a value from a file or a socket request
the hub reads is used unvalidated. Normal for hardening with no bypass you can show.
