---
title: Waiting List
type: note
permalink: projects/waiting-list/overview
tags: ["waiting-list", "decisions", "owner-tasks", "browser"]
status: complete
opened: "2026-11-11"
---

# Waiting List

Issue #7: the "Everything waiting" view. Every unanswered decision and unfinished owner task across sessions shows in
one place, as two lists, oldest first, with one row open at a time. The view is read-only until #11 adds answering. It
ends when #27 merges.

## Where it stands

- [status] Built: `isWaiting` from the hub, the `#/waiting` route, the two oldest-first lists with one read-only row
  open, and the sessions held in a terminal. Its durable facts are in the hub notes under `domains/hub/`

## Documents

- [[Waiting List Checklist]]: the units of work and which is live
- [[Waiting List Decisions]]: rulings taken and questions still open
- [[Waiting List Spec]]: the file map and the issue text
- [[Waiting List Estimate]]: the size it was planned at

## Relations

- see_also [[Hub Browser Code]]
- see_also [[Hub Browser Surface]]
- see_also [[Hub Outside State]]
- see_also [[Hub Style Guide]]
