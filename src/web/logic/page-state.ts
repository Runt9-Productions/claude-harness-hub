import { connectionReducer, initialConnectionState, type ConnectionEvent, type ConnectionState } from "./connection.ts";

/** The connection and the owner's own UI state, which a new snapshot never touches. */
export type PageState = ConnectionState & {
  /** Session keys whose card shows every open task. */
  expandedCards: ReadonlySet<string>;
};

export type PageEvent = ConnectionEvent | { kind: "cardToggled"; key: string };

export type PageDispatch = (event: PageEvent) => void;

export const initialPageState: PageState = { ...initialConnectionState, expandedCards: new Set() };

function toggled(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(keys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function pageReducer(state: PageState, event: PageEvent): PageState {
  if (event.kind === "cardToggled") return { ...state, expandedCards: toggled(state.expandedCards, event.key) };
  return { ...connectionReducer(state, event), expandedCards: state.expandedCards };
}
