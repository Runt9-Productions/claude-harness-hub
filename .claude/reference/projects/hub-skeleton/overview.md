---
title: Hub Skeleton
type: note
permalink: projects/hub-skeleton/overview
tags: ["skeleton", "server", "browser", "preact", "launch-token"]
status: implementation
opened: "2026-11-11"
---

# Hub Skeleton

The first code in `src/`, for issue #5: one command starts the server and prints a launch link, the link opens a
Preact page that proves itself with the launch token and polls a snapshot with no sessions, and every other request
is refused. It ends when that pull request merges and `gate` passes on it.

## Where it stands

- [status] Spec written; the build has not started

## Documents

- [[Hub Skeleton Checklist]]: the units of work and which is live
- [[Hub Skeleton Decisions]]: rulings taken and questions still open
- [[Hub Skeleton Spec]]: the file map and the issue text
- [[Hub Skeleton Estimate]]: the size it was planned at

## Designs ruled out

- Three pull requests (a Node-only shell, then the page, then browser tests): the owner wants the first one to lay the
  groundwork for server and client together
- Playwright in this slice: it clears the 7 day release rule on 2026-11-12, and the verifier's headless Chrome run
  covers the page under the CSP until the browser test slice

## Relations

- see_also [[Hub Architecture]]
- see_also [[Hub Browser Surface]]
- see_also [[Hub Browser Code]]
- see_also [[Hub Tests]]
