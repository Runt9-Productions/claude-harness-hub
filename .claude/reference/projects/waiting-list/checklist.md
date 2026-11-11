---
title: Waiting List Checklist
type: note
permalink: projects/waiting-list/checklist
tags: ["waiting-list", "tasks"]
---

# Waiting List Checklist

## Status

- **Live item:** 01
- **How far along:** planned and approved
- **Blocked on:** nothing
- **Last moved:** 2026-11-11

## Build Order

01, 02, 03, 04

The view needs the logic, the logic needs `isWaiting`, and the docs follow the code.

## Checklist

- [ ] 01 Waiting items marked by the hub: `isWaiting` on `DecisionView` and `OwnerTaskView`, set in
  `src/server/hub/snapshot.ts`, read by the page's reader, with tests
- [ ] 02 Waiting list logic: the hash route, collecting and ordering the waiting items, the held sessions, the open
  row in the page state, and the row's age, all in `src/web/logic` with tests
- [ ] 03 Waiting list view: the switcher's links and count, `src/web/ui/waiting.tsx`, its CSS, the fixtures it needs,
  and the style guide note
- [ ] 04 Docs: the hub notes gain the route, the waiting list's state and `isWaiting`
