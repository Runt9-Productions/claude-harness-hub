import type { Snapshot, SourceError } from "../../shared/api.ts";
import type { Connection } from "../logic/connection.ts";
import { countByState, placeErrors } from "../logic/dashboard.ts";
import type { PageDispatch, PageState } from "../logic/page-state.ts";
import { Dashboard } from "./dashboard.tsx";

const connectionLabels: Record<Connection, string> = {
  loading: "Connecting",
  live: "Live",
  stale: "Hub not responding",
  signedOut: "Signed out",
};

const laterReason = "Arrives in a later release";

function StateCounts({ snapshot }: { snapshot: Snapshot }) {
  const counts = countByState(snapshot.sessions);
  const text = counts.map(([state, count]) => `${count} ${state}`).join(", ");
  return <p class="state-counts">{counts.length === 0 ? "No sessions" : text}</p>;
}

function TopBar({ state }: { state: PageState }) {
  return (
    <header class="top-bar">
      <h1>Claude harness hub</h1>
      <nav class="views" aria-label="Views">
        <a class="view-button" href="#/" aria-current="page">
          Dashboard
        </a>
        <button type="button" class="view-button" disabled title={laterReason}>
          Everything waiting
        </button>
      </nav>
      {state.snapshot !== undefined && <StateCounts snapshot={state.snapshot} />}
      <div class="top-bar-end">
        <p class="connection" data-connection={state.connection}>
          {connectionLabels[state.connection]}
        </p>
        <label class="set-all">
          Set all sessions
          <select name="set-all" disabled title={laterReason}>
            <option>{laterReason}</option>
          </select>
        </label>
      </div>
    </header>
  );
}

function Notices({ state }: { state: PageState }) {
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
          Invalid token.
        </p>
      )}
    </>
  );
}

function GeneralErrors({ errors }: { errors: readonly SourceError[] }) {
  if (errors.length === 0) return null;
  return (
    <ul class="general-errors">
      {errors.map((error, index) => (
        <li key={index}>
          {error.source}
          {error.sessionId === undefined ? "" : ` (${error.sessionId})`}: {error.message}
        </li>
      ))}
    </ul>
  );
}

function SnapshotView({ snapshot, state, dispatch }: { snapshot: Snapshot; state: PageState; dispatch: PageDispatch }) {
  const errors = placeErrors(snapshot.errors, snapshot.sessions);
  return (
    <>
      <GeneralErrors errors={errors.general} />
      <main>
        <Dashboard
          sessions={snapshot.sessions}
          errorsBySession={errors.bySession}
          expandedCards={state.expandedCards}
          dispatch={dispatch}
        />
      </main>
    </>
  );
}

export function Page({ state, dispatch }: { state: PageState; dispatch: PageDispatch }) {
  return (
    <>
      <TopBar state={state} />
      <Notices state={state} />
      {state.snapshot !== undefined && <SnapshotView snapshot={state.snapshot} state={state} dispatch={dispatch} />}
    </>
  );
}
