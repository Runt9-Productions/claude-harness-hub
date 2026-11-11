import { snapshotPath, type Snapshot } from "../../shared/api.ts";
import type { ConnectionEvent } from "../logic/connection.ts";
import { readLaunchHash } from "../logic/launch-link.ts";
import { pollInterval } from "../logic/poll.ts";
import { readSnapshot } from "../logic/snapshot.ts";

const tokenKey = "hub.token";
// Outlasts the server's 5 second `claude agents` timeout. fetch has no timeout of its own, so without this one hung
// request would end the chained poll for good.
const requestTimeoutMs = 8000;

type SnapshotResult = { kind: "snapshot"; snapshot: Snapshot } | { kind: "unauthorized" } | { kind: "failed" };

// A body that is not a snapshot throws past this function, so it reaches the failure banner rather than reading as a
// hub that is not responding.
async function fetchSnapshot(token: string): Promise<SnapshotResult> {
  let body: unknown;
  try {
    const response = await fetch(snapshotPath, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (response.status === 401) return { kind: "unauthorized" };
    if (!response.ok) return { kind: "failed" };
    body = await response.json();
  } catch {
    // fetch and the body read reject when the hub is unreachable or the timeout fires: the hub is not responding.
    return { kind: "failed" };
  }
  return { kind: "snapshot", snapshot: readSnapshot(body) };
}

/**
 * Takes a launch token from the address on load and on each `hashchange`, then polls the snapshot one request at a
 * time, re-reading the saved token each time so a link opened in another tab recovers this one.
 */
export function startClient(dispatch: (event: ConnectionEvent) => void): void {
  let runId: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isRequestInFlight = false;

  /** Reloads the page for the new run's code when the hub restarted, and says whether it did. */
  function reloadsForNewRun(snapshot: Snapshot): boolean {
    if (runId !== undefined && snapshot.runId !== runId) {
      location.reload();
      return true;
    }
    runId = snapshot.runId;
    return false;
  }

  // The token is saved only once the hub accepts it, so a page on another origin that navigates this tab to a wrong
  // #t= cannot replace a working token.
  async function takeLaunchLink(): Promise<void> {
    const launch = readLaunchHash(location.hash);
    if (launch.kind === "absent") return;
    // Removes the token from the address bar and history without firing hashchange.
    history.replaceState(null, "", "#/");
    if (launch.kind === "malformed") {
      dispatch({ kind: "linkRejected" });
      return;
    }
    const result = await fetchSnapshot(launch.token);
    if (result.kind === "unauthorized") {
      dispatch({ kind: "linkRejected" });
      return;
    }
    if (result.kind === "failed") {
      dispatch({ kind: "failed" });
      return;
    }
    localStorage.setItem(tokenKey, launch.token);
    if (reloadsForNewRun(result.snapshot)) return;
    dispatch({ kind: "linkAccepted", snapshot: result.snapshot });
  }

  async function pollOnce(): Promise<void> {
    const token = localStorage.getItem(tokenKey);
    if (token === null) {
      dispatch({ kind: "unauthorized" });
      return;
    }
    const result = await fetchSnapshot(token);
    if (result.kind !== "snapshot") {
      dispatch({ kind: result.kind });
      return;
    }
    if (reloadsForNewRun(result.snapshot)) return;
    dispatch({ kind: "received", snapshot: result.snapshot });
  }

  function schedule(delayMs: number): void {
    clearTimeout(timer);
    timer = setTimeout(() => void poll(), delayMs);
  }

  async function poll(): Promise<void> {
    isRequestInFlight = true;
    try {
      await pollOnce();
    } finally {
      isRequestInFlight = false;
    }
    schedule(pollInterval(document.hidden));
  }

  // Moves the pending poll rather than starting a second loop. A request in flight schedules the next one itself at
  // the interval for the visibility it finishes in.
  function onVisibilityChange(): void {
    if (isRequestInFlight) return;
    const delayMs = document.hidden ? pollInterval(true) : 0;
    schedule(delayMs);
  }

  window.addEventListener("hashchange", () => void takeLaunchLink());
  document.addEventListener("visibilitychange", onVisibilityChange);
  void takeLaunchLink().then(poll);
}
