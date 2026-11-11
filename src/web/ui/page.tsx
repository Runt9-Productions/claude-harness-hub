import type { Connection, ConnectionState } from "../logic/connection.ts";

const connectionLabels: Record<Connection, string> = {
  loading: "Connecting",
  live: "Live",
  stale: "Hub not responding",
  signedOut: "Signed out",
};

function Notices({ state }: { state: ConnectionState }) {
  return (
    <>
      {state.connection === "signedOut" && (
        <p class="notice" role="status">
          This page is not signed in to the running hub. Open the link the hub printed in its terminal; a restarted hub
          prints a new one.
        </p>
      )}
      {state.isLinkRejected && (
        <p class="notice" role="status">
          That link is from an earlier run of the hub. Open the link it printed most recently.
        </p>
      )}
    </>
  );
}

export function Page({ state }: { state: ConnectionState }) {
  return (
    <>
      <header class="top-bar">
        <h1>Claude harness hub</h1>
        <p class="connection" data-connection={state.connection}>
          {connectionLabels[state.connection]}
        </p>
      </header>
      <Notices state={state} />
      <main>{state.snapshot !== undefined && <p class="empty">No sessions are listed yet.</p>}</main>
    </>
  );
}
