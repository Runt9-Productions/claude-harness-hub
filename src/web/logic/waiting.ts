import type { DecisionView, OwnerTaskView, SessionView } from "../../shared/api.ts";
import { byStart, sessionName } from "./dashboard.ts";

export type WaitingRow<Item> = {
  /** `<session key>/<kind>/<item id>`, since item ids restart in each session. */
  key: string;
  sessionName: string;
  session: SessionView;
  item: Item;
};

export type HeldSession = { sessionName: string; session: SessionView };

export type WaitingList = {
  decisions: WaitingRow<DecisionView>[];
  ownerTasks: WaitingRow<OwnerTaskView>[];
  /** Sessions waiting in their terminal. They are not rows and add nothing to the count. */
  held: HeldSession[];
};

type WaitingItem = { id: string; createdAt?: number; isWaiting: boolean };

function ascending(first: number, second: number): number {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

function sortTime(row: WaitingRow<WaitingItem>): number {
  return row.item.createdAt ?? row.session.startedAt;
}

function hasCreatedAt(row: WaitingRow<WaitingItem>): boolean {
  return row.item.createdAt !== undefined;
}

/** The first run of digits in the id, so `D12` is 12; an id without one sorts after every id with one. */
function idNumber(row: WaitingRow<WaitingItem>): number {
  const digits = /\d+/.exec(row.item.id);
  return digits === null ? Number.POSITIVE_INFINITY : Number(digits[0]);
}

function oldestFirst(first: WaitingRow<WaitingItem>, second: WaitingRow<WaitingItem>): number {
  const byTime = ascending(sortTime(first), sortTime(second));
  if (byTime !== 0) return byTime;
  const byCreatedAt = Number(hasCreatedAt(second)) - Number(hasCreatedAt(first));
  if (byCreatedAt !== 0) return byCreatedAt;
  const byNumber = ascending(idNumber(first), idNumber(second));
  if (byNumber !== 0) return byNumber;
  return first.item.id.localeCompare(second.item.id);
}

function waitingRows<Item extends WaitingItem>(
  sessions: readonly SessionView[],
  kind: string,
  itemsOf: (session: SessionView) => readonly Item[],
): WaitingRow<Item>[] {
  const rows: WaitingRow<Item>[] = [];
  for (const session of sessions) {
    for (const item of itemsOf(session)) {
      if (!item.isWaiting) continue;
      rows.push({ key: `${session.key}/${kind}/${item.id}`, sessionName: sessionName(session), session, item });
    }
  }
  return rows.toSorted(oldestFirst);
}

function isHeld(session: SessionView): boolean {
  return session.status === "waiting";
}

/** Every item the hub marks `isWaiting`, across sessions, each list oldest first, and the sessions held in a terminal. */
export function waitingList(sessions: readonly SessionView[]): WaitingList {
  const held = sessions
    .filter(isHeld)
    .toSorted(byStart)
    .map((session) => ({ sessionName: sessionName(session), session }));
  return {
    decisions: waitingRows(sessions, "decision", (session) => session.decisions),
    ownerTasks: waitingRows(sessions, "owner-task", (session) => session.ownerTasks),
    held,
  };
}

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

/** How long ago the item was created, such as `5m`, `3h` or `2d`, rounded down; absent without `createdAt`. */
export function rowAge(createdAt: number | undefined, now: number): string | undefined {
  if (createdAt === undefined) return undefined;
  const elapsedMs = Math.max(0, now - createdAt);
  if (elapsedMs >= dayMs) return `${Math.floor(elapsedMs / dayMs)}d`;
  if (elapsedMs >= hourMs) return `${Math.floor(elapsedMs / hourMs)}h`;
  return `${Math.floor(elapsedMs / minuteMs)}m`;
}
