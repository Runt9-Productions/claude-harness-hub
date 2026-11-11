import type { SessionView, SourceError, TaskView } from "../../shared/api.ts";

export type Groups = { needsYou: SessionView[]; everythingElse: SessionView[] };

function byStart(first: SessionView, second: SessionView): number {
  return first.startedAt - second.startedAt;
}

/**
 * Splits the sessions into "Needs you" and "Everything else", each oldest first, so a new session joins the end of
 * its group and a card moves only when its session starts or stops needing the owner.
 */
export function groupSessions(sessions: readonly SessionView[]): Groups {
  const sorted = sessions.toSorted(byStart);
  return {
    needsYou: sorted.filter((session) => session.needsYou),
    everythingElse: sorted.filter((session) => !session.needsYou),
  };
}

/**
 * The one word a card and the top bar show for a session: `waiting` while a live process waits, else the background
 * `state`, else the live `status` with `busy` shown as `working`. Unknown values pass through as listed.
 */
export function sessionState(session: SessionView): string {
  if (session.status === "waiting") return "waiting";
  if (session.state !== undefined) return session.state;
  if (session.status === "busy") return "working";
  return session.status ?? "unlisted";
}

const stateOrder = ["waiting", "blocked", "working", "idle", "done", "failed", "stopped"];

function stateRank(state: string): number {
  const rank = stateOrder.indexOf(state);
  return rank === -1 ? stateOrder.length : rank;
}

function byStateOrder([first]: [string, number], [second]: [string, number]): number {
  const byRank = stateRank(first) - stateRank(second);
  if (byRank !== 0) return byRank;
  return first.localeCompare(second);
}

/** Sessions per state for the top bar, in a fixed order with the states that need the owner first. */
export function countByState(sessions: readonly SessionView[]): [state: string, count: number][] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const state = sessionState(session);
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return [...counts].toSorted(byStateOrder);
}

export type PlacedErrors = {
  /** Errors for a session with a card, by session key. */
  bySession: Map<string, SourceError[]>;
  /** Errors with no session, or for a session with no card, which show under the top bar. */
  general: SourceError[];
};

/** Matches an error's `sessionId` to a session's `key`, which is the full id whenever the session has one. */
export function placeErrors(errors: readonly SourceError[], sessions: readonly SessionView[]): PlacedErrors {
  const keys = new Set(sessions.map((session) => session.key));
  const placed: PlacedErrors = { bySession: new Map(), general: [] };
  for (const error of errors) {
    const key = error.sessionId;
    if (key === undefined || !keys.has(key)) {
      placed.general.push(error);
      continue;
    }
    placed.bySession.set(key, [...(placed.bySession.get(key) ?? []), error]);
  }
  return placed;
}

/** Unanswered decisions and unfinished owner tasks, the items the waiting list will hold. */
export function waitingCount(session: SessionView): number {
  const unanswered = session.decisions.filter((decision) => decision.answer === undefined);
  const unfinished = session.ownerTasks.filter((ownerTask) => !ownerTask.isDone);
  return unanswered.length + unfinished.length;
}

const minimumColumnWidthPx = 400;
const columnGapPx = 16;
const pagePaddingPx = 64;

/** How many card columns fit a viewport this wide, at least one; a 1920 pixel screen gets 4. */
export function columnCount(viewportWidthPx: number): number {
  const fitting = (viewportWidthPx - pagePaddingPx + columnGapPx) / (minimumColumnWidthPx + columnGapPx);
  return Math.max(1, Math.floor(fitting));
}

/**
 * Deals the cards into `count` columns left to right, so a card that grows pushes down only the cards beneath it in
 * its own column.
 */
export function dealIntoColumns<T>(cards: readonly T[], count: number): T[][] {
  const columns = Array.from({ length: count }, (): T[] => []);
  for (const [index, card] of cards.entries()) columns[index % count]?.push(card);
  return columns;
}

export const shownTaskCount = 3;

export type CardTasks = {
  /** Open tasks to draw, blocked first, cut to `shownTaskCount` unless the card is expanded. */
  shown: TaskView[];
  openCount: number;
  hiddenCount: number;
  doneCount: number;
  blockedCount: number;
};

export function isBlocked(task: TaskView): boolean {
  return task.status === "blocked";
}

function blockedFirst(first: TaskView, second: TaskView): number {
  return Number(isBlocked(second)) - Number(isBlocked(first));
}

export function cardTasks(tasks: readonly TaskView[], isExpanded: boolean): CardTasks {
  const open = tasks.filter((task) => task.status !== "done").toSorted(blockedFirst);
  const shown = isExpanded ? open : open.slice(0, shownTaskCount);
  return {
    shown,
    openCount: open.length,
    hiddenCount: open.length - shown.length,
    doneCount: tasks.length - open.length,
    blockedCount: open.filter(isBlocked).length,
  };
}
