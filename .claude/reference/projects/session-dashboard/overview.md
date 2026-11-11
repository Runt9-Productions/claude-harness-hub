---
title: Session Dashboard
type: note
permalink: projects/session-dashboard/overview
tags: ["dashboard", "sources", "snapshot", "claude-agents", "board-store", "away-store"]
status: complete
opened: "2026-11-11"
---

# Session Dashboard

Issue #6: the hub's first real data. The server reads `claude agents --json --all` and the `board` and `away` stores,
validates them and builds the snapshot, and the page shows one card per session in a dashboard with "Needs you"
first. It ends when that pull request merges.

## Where it stands

- [status] Built: the session list and store sources, the snapshot with `needsYou` and `waitingCount`, and the
  dashboard with held columns. Its durable facts are in the hub notes under `domains/hub/`

## Documents

- [[Session Dashboard Checklist]]: the units of work and which is live
- [[Session Dashboard Decisions]]: rulings taken and questions still open
- [[Session Dashboard Spec]]: the file map and the issue text
- [[Session Dashboard Estimate]]: the size it was planned at

## Designs ruled out

- Two pull requests, data then view: the owner chose one, as for the skeleton
- A status wall of large tiles, and bands: the owner rejected both in the mockups; cards keep one session's
  information in a tight space

## Relations

- see_also [[Hub Outside State]]
- see_also [[Claude Agents JSON List]]
- see_also [[Hub Browser Code]]
- see_also [[Hub Architecture]]
