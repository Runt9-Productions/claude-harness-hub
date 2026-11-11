import type { ComponentChildren } from "preact";
import type { Snapshot, SourceError } from "../../shared/api.ts";
import type { Connection } from "../logic/connection.ts";
import { countByState, placeErrors } from "../logic/dashboard.ts";
import type { PageDispatch, PageState } from "../logic/page-state.ts";
import type { Route } from "../logic/route.ts";
import { waitingTotal } from "../logic/waiting.ts";
import { Dashboard } from "./dashboard.tsx";
import { laterReason } from "./later.ts";
import { WaitingView } from "./waiting.tsx";

const connectionLabels: Record<Connection, string> = {
  loading: "Connecting",
  live: "Live",
  stale: "Hub not responding",
  signedOut: "Signed out",
};

function StateCounts({ snapshot }: { snapshot: Snapshot }) {
  const counts = countByState(snapshot.sessions);
  const text = counts.map(([state, count]) => `${count} ${state}`).join(", ");
  return <p class="state-counts">{counts.length === 0 ? "No sessions" : text}</p>;
}

function ViewLink({
  route,
  current,
  href,
  children,
}: {
  route: Route;
  current: Route;
  href: string;
  children: ComponentChildren;
}) {
  return (
    <a class="view-button" href={href} aria-current={route === current ? "page" : undefined}>
      {children}
    </a>
  );
}

function TopBar({ state }: { state: PageState }) {
  const total = state.snapshot === undefined ? 0 : waitingTotal(state.snapshot.sessions);
  return (
    <header class="top-bar">
      <h1>Claude harness hub</h1>
      <nav class="views" aria-label="Views">
        <ViewLink route="dashboard" current={state.route} href="#/">
          Dashboard
        </ViewLink>
        <ViewLink route="waiting" current={state.route} href="#/waiting">
          Everything waiting
          {total > 0 && <span class="view-count">{total}</span>}
        </ViewLink>
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

function UnknownRoute() {
  return (
    <p class="empty">
      This address names no view.{" "}
      <a class="text-link" href="#/">
        Open the dashboard
      </a>
    </p>
  );
}

function SnapshotView({ snapshot, state, dispatch }: { snapshot: Snapshot; state: PageState; dispatch: PageDispatch }) {
  const errors = placeErrors(snapshot.errors, snapshot.sessions);
  // Only the dashboard has cards to show a session's own errors on.
  const generalErrors = state.route === "dashboard" ? errors.general : snapshot.errors;
  return (
    <>
      <GeneralErrors errors={generalErrors} />
      <main>
        {state.route === "dashboard" && (
          <Dashboard
            sessions={snapshot.sessions}
            errorsBySession={errors.bySession}
            expandedCards={state.expandedCards}
            dispatch={dispatch}
          />
        )}
        {state.route === "waiting" && <WaitingView snapshot={snapshot} openRow={state.openRow} dispatch={dispatch} />}
        {state.route === "unknown" && <UnknownRoute />}
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
