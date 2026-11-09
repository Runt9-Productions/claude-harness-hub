---
title: Chrome Hidden Tab Timers
type: note
permalink: platform/chrome-hidden-tab-timers
tags: ["chrome", "timers", "throttling", "polling", "visibility"]
verified: 2026-11-09
coverage: partial
measured_on: "Chrome 157, on Linux"
---

# Chrome Hidden Tab Timers

> **Scope.** Whether Chrome slows a hidden tab's poll loop, from one measurement on 2026-11-08 in private Chrome (two
> hidden tabs for 8 minutes) that was not re-run for this note, and Chrome's timer throttling post, read on 2026-11-09.
> Not covered: Edge, a tab Chrome discards outright, battery saver and energy saver modes, and other browsers.

Read this before changing the poll interval in `src/web/logic` or `client.ts`, or relying on the browser to slow a
hidden page.

## Observations

- [vendor] Intensive throttling batches timers to once a minute when the page has been hidden more than 5 minutes,
  the chain count is 5 or more, the page has been silent at least 30 seconds and WebRTC is not in use (Chrome
  developer blog post on timer throttling in Chrome 88, by Jake Archibald of the Chrome team, for January 2021)
- [vendor] A timer is chained when `setTimeout` is called in the same task as a `setTimeout` callback (same post)
- [fact] A loop that awaits `fetch` and then calls `setTimeout` stayed at about 3,000 ms for all 170 beats over 8
  hidden minutes, with `document.visibilityState` read as `hidden` #measured
- [fact] A plain `setTimeout` chain in the same setup slowed to about 60,000 ms by 147 seconds, so the setup could
  show throttling #measured
- [trap] So Chrome does not slow the hub's poll loop when its tab is hidden: the `setTimeout` runs in the task that
  resolved the `fetch`, not in a timer callback, and the loop is never chained. A hidden interval has to be chosen by
  the page itself #silent-failure

## Relations

- see_also [[Hub Browser Surface]]
