import { connectionReducer, initialConnectionState, type ConnectionEvent, type ConnectionState } from "./connection.ts";
import { readRoute, type Route } from "./route.ts";
import type { WaitingList } from "./waiting.ts";

/** Which waiting row the owner left open: none chosen yet, a row's key, or none after closing the open one. */
export type OpenRowChoice = { kind: "unchosen" } | { kind: "chosen"; key: string } | { kind: "closed" };

/** The connection and the owner's own UI state, which a new snapshot never touches. */
export type PageState = ConnectionState & {
  route: Route;
  /** Session keys whose card shows every open task. */
  expandedCards: ReadonlySet<string>;
  openRow: OpenRowChoice;
};

export type PageEvent =
  | ConnectionEvent
  | { kind: "routeChanged"; hash: string }
  | { kind: "cardToggled"; key: string }
  | { kind: "rowOpened"; key: string }
  | { kind: "rowClosed" };

export type PageDispatch = (event: PageEvent) => void;

export function initialPageState(hash: string): PageState {
  return {
    ...initialConnectionState,
    route: readRoute(hash),
    expandedCards: new Set(),
    openRow: { kind: "unchosen" },
  };
}

function toggled(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(keys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function pageReducer(state: PageState, event: PageEvent): PageState {
  if (event.kind === "routeChanged") return { ...state, route: readRoute(event.hash) };
  if (event.kind === "cardToggled") return { ...state, expandedCards: toggled(state.expandedCards, event.key) };
  if (event.kind === "rowOpened") return { ...state, openRow: { kind: "chosen", key: event.key } };
  if (event.kind === "rowClosed") return { ...state, openRow: { kind: "closed" } };
  return { ...state, ...connectionReducer(state, event) };
}

function isListed(list: WaitingList, key: string): boolean {
  const rows = [...list.decisions, ...list.ownerTasks];
  return rows.some((row) => row.key === key);
}

/**
 * The key of the one open row: the chosen row while it is listed, else the oldest decision, else the oldest owner
 * task. Closing the open row leaves none open until another is opened.
 */
export function openRowKey(choice: OpenRowChoice, list: WaitingList): string | undefined {
  if (choice.kind === "closed") return undefined;
  if (choice.kind === "chosen" && isListed(list, choice.key)) return choice.key;
  return list.decisions[0]?.key ?? list.ownerTasks[0]?.key;
}
