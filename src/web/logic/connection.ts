import type { Snapshot } from "../../shared/api.ts";

export type Connection = "loading" | "live" | "stale" | "signedOut";

export type ConnectionState = {
  connection: Connection;
  /** The last snapshot received, kept while the connection is stale or signed out. */
  snapshot?: Snapshot;
  /** A launch link was refused; cleared only when a later link is accepted, not by a poll. */
  isLinkRejected: boolean;
};

export type ConnectionEvent =
  | { kind: "received"; snapshot: Snapshot }
  | { kind: "failed" }
  | { kind: "unauthorized" }
  | { kind: "linkAccepted"; snapshot: Snapshot }
  | { kind: "linkRejected" };

export const initialConnectionState: ConnectionState = { connection: "loading", isLinkRejected: false };

export function connectionReducer(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  switch (event.kind) {
    case "received":
      return { ...state, connection: "live", snapshot: event.snapshot };
    case "failed":
      return { ...state, connection: "stale" };
    case "unauthorized":
      return { ...state, connection: "signedOut" };
    case "linkAccepted":
      return { connection: "live", snapshot: event.snapshot, isLinkRejected: false };
    case "linkRejected":
      return { ...state, isLinkRejected: true };
    default:
      throw new Error(`unknown connection event ${JSON.stringify(event)}`);
  }
}
