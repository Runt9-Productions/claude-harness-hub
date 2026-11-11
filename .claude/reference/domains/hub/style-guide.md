---
title: Hub Style Guide
type: note
permalink: hub/style-guide
tags: ["css", "tokens", "palette", "dashboard", "cards", "waiting-list", "rows", "layout", "ui"]
verified: 2026-11-11
coverage: partial
sources:
  - "src/web/styles.css"
  - "src/web/ui/page.tsx"
  - "src/web/ui/dashboard.tsx"
  - "src/web/ui/waiting.tsx"
  - "src/web/logic/dashboard.ts"
---

# Hub Style Guide

> **Scope.** The page's colour tokens, the top bar, the dashboard card's parts and the layout rules later views
> reuse, read from the dashboard's CSS, views and layout logic on #26, and the waiting list's rows and columns, read
> from its view and CSS on #27. The palette, the card's look and the rows' look follow the owner's mockup, which is not
> in this repository. Not covered: how any of it renders in a browser (no line here was measured), the session view,
> which is not built, and the CSS rules [[Hub Browser Code]] holds.

Read this before adding a view, a component or a colour to `src/web/`.

## Observations

### Direction

- [decision] Dark only on a low-saturation slate palette, modes as coloured text (present plain, distracted blue, away
  yellow), every button with a hover state, and no stretching when one or two sessions run (owner, 2026-11-08)
- [invariant] Parts are told apart by a dividing line or a background change, not a bordered box: cards sit on
  `--surface` against `--ground` with no border, and a group's label carries the dividing line

### Tokens

- [fact] The tokens live on `:root` in `src/web/styles.css`: `--ground` for the page, `--dock` for the top bar,
  `--surface` for a card or a notice, `--raised` for a hovered or current control, `--raised-hover` for the current
  control hovered, `--line` for every dividing line,
  `--fg` and `--muted` for text, `--accent` for focus and the current view (`:root`, `src/web/styles.css:4`)
- [fact] Signal colours come in pairs, a fill for marks and an `-fg` for text: `--amber` and `--amber-fg` for what
  needs the owner and for away, `--red-fg` for errors, `--blue-fg` for distracted, `--green-fg` for a live connection
- [invariant] A new colour is a token on `:root`, never a literal in a rule, so the palette stays one list
- [fact] Type is the system font stack at 15px/1.5 and `--mono` for paths and commands; the CSP's
  `default-src 'none'` blocks web fonts, so the mockup's fonts are not loaded
- [fact] Sizes in use: 16px for a card name and the page title, 14px for secondary text and controls, 13px and
  12.5px for counts and minor labels, 12px uppercase with 0.05em letter spacing for a group label

### Top bar

- [fact] The top bar holds the title, the view switcher, the count of sessions by state, the connection state and
  the Set all sessions control, in that order, and sits on `--dock` above every view (`TopBar`,
  `src/web/ui/page.tsx:43`)
- [fact] The view switcher is a joined row of `.view-button` links, `#/` and `#/waiting`; the current view carries
  `aria-current="page"` and an `--accent` underline. "Everything waiting" carries the sum of every session's
  `waitingCount` in `--amber-fg`, drawn only above zero (`ViewLink`, `src/web/ui/page.tsx:25`)
- [fact] Errors with no card to show on list under the top bar on `--surface`, above the view; on a view without
  cards every error lists there (`placeErrors`, `src/web/logic/dashboard.ts:67`)

### Cards

- [fact] A card's parts, top to bottom: a head with a state dot, the name and the waiting count; a line of kind,
  state and mode; the working directory in `--mono`; "process stopped" with the `claude attach` command when no
  process runs, a line the waiting list's open row reuses; the session's errors; the agent tasks (`Card`,
  `src/web/ui/dashboard.tsx:126`; `StoppedLine`, `src/web/ui/dashboard.tsx:58`)
- [fact] A card for a session that needs the owner carries a 3px `--amber` bar on its left edge, drawn with an inset
  `box-shadow` so the content does not shift
- [fact] The state dot is filled `--amber` when the session needs the owner, filled `--accent` while it works, and a
  `--muted` ring otherwise (`sessionTone`, `src/web/ui/dashboard.tsx:33`)
- [fact] Agent tasks show a heading of done and blocked counts and at most 3 open tasks, blocked first, each with a
  dot, the title cut to one line and its progress; "Show N more" expands the card in place (`cardTasks`,
  `src/web/logic/dashboard.ts:153`)
- [invariant] Each card renders inside its own error boundary, so one bad session draws a failure line and the rest
  carry on (`CardBoundary`, `src/web/ui/dashboard.tsx:148`)

### Waiting list

- [fact] Two columns, decisions taking 3 shares and tasks 2, each under a group label with its count; they stack into
  one below 1000px. "Held in a terminal" is a second group label and list of muted lines under the decisions
  (`WaitingView`, `src/web/ui/waiting.tsx:145`)
- [fact] A row is one button across the column, the session name in `--muted`, the title cut to one line, the age
  and a chevron, with a `--line` divider under each row and no box. In the tasks column, and in both below 1000px,
  the session name sits above the title (`Row`, `src/web/ui/waiting.tsx:83`)
- [fact] The open row moves to `--surface` and its title wraps at weight 500; its body holds the stopped line, the
  board text in `--muted` with its own line breaks kept, then the controls
- [fact] A control in a row is a `.action` button with a `--line` border; the recommended option has an `--accent`
  border on `--raised`, Dismiss is borderless `--muted` text, and an option's description sits under its label in
  12.5px `--muted`. Checklist checkboxes take `--accent`. A started owner task shows "Started" as plain `--muted`
  text in place of the Start button

### Layout

- [invariant] Cards sit in columns of equal width, so a tall card pushes down only the cards beneath it; CSS columns
  or a grid would reflow every card when one grows. A card keeps its column while it stays in its group, a card
  entering a group takes the column with the fewest cards, the leftmost on a tie, and a new column count places every
  card afresh, so a card joining or leaving moves no other card. Each column runs in the group's order
  (`placeInColumns`, `src/web/logic/dashboard.ts:104`)
- [invariant] Each column takes an equal share whether or not it holds a card, so one session shows one ordinary
  card a column wide, never stretched across the screen
- [fact] The column count is set by the viewport width: at least one, and as many 400px columns with 16px gaps as fit
  inside 32px of padding a side, which is 4 on a 1920px screen (`columnCount`, `src/web/logic/dashboard.ts:86`)
- [fact] Both groups use the same column count, so their columns line up; an empty group draws nothing
- [fact] Below 1000px wide the top bar and page padding drop to 16px a side and the top bar's end wraps

### Controls

- [invariant] Every enabled button and link changes on hover, the current one included, by a background change to
  `--raised` or a text change from `--muted` to `--fg`; the current view, already on `--raised`, goes to
  `--raised-hover`. A disabled one shows `cursor: not-allowed` and no hover change, and its `title` says why
- [fact] Focus shows as a 2px `--accent` outline on `:focus-visible`, and `prefers-reduced-motion` turns transitions
  off
- [fact] State shown by CSS is a `data-` attribute (`data-tone`, `data-mode`, `data-needs-you`, `data-blocked`,
  `data-open`, `data-emphasis`, `data-layout`), not a class built from a string

## Relations

- part_of [[Hub Architecture]]
- see_also [[Hub Browser Code]]
