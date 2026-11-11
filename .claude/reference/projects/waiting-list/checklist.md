---
title: Waiting List Checklist
type: note
permalink: projects/waiting-list/checklist
tags: ["waiting-list", "tasks"]
---

# Waiting List Checklist

## Status

- **Live item:** none; every item is committed
- **How far along:** 01 to 04 built and verified in a browser
- **Blocked on:** nothing
- **Last moved:** 2026-11-11

## Build Order

01, 02, 03, 04

The view needs the logic, the logic needs `isWaiting`, and the docs follow the code.

## Checklist

- [x] 01 Waiting items marked by the hub: `isWaiting` on `DecisionView` and `OwnerTaskView`, set in
  `src/server/hub/snapshot.ts`, read by the page's reader, with tests
- [x] 02 Waiting list logic: the hash route, collecting and ordering the waiting items, the held sessions, the open
  row in the page state, and the row's age, all in `src/web/logic` with tests
- [x] 03 Waiting list view: the switcher's links and count, `src/web/ui/waiting.tsx`, its CSS, the fixtures it needs,
  and the style guide note
- [x] 04 Docs: the hub notes gain the route, the waiting list's state and `isWaiting`
