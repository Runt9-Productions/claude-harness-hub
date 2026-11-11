import assert from "node:assert/strict";
import { test } from "node:test";
import type { Snapshot } from "../../shared/api.ts";
import { connectionReducer, initialConnectionState, type ConnectionState } from "./connection.ts";

const earlier: Snapshot = {
  runId: "run-a",
  now: 1000,
  sessions: [],
  errors: [{ source: "agents", message: "example failure" }],
};
const later: Snapshot = { runId: "run-a", now: 3000, sessions: [], errors: [] };

const live: ConnectionState = { connection: "live", snapshot: earlier, isLinkRejected: false };

void test("starts loading with no snapshot", () => {
  assert.deepEqual(initialConnectionState, { connection: "loading", isLinkRejected: false });
});

void test("a received snapshot replaces the last one whole and the connection is live", () => {
  const stale: ConnectionState = { ...live, connection: "stale" };
  assert.deepEqual(connectionReducer(stale, { kind: "received", snapshot: later }), {
    connection: "live",
    snapshot: later,
    isLinkRejected: false,
  });
});

void test("a failed request marks the last snapshot stale and a 401 marks it signed out, keeping it either way", () => {
  assert.deepEqual(connectionReducer(live, { kind: "failed" }), { ...live, connection: "stale" });
  assert.deepEqual(connectionReducer(live, { kind: "unauthorized" }), { ...live, connection: "signedOut" });
});

void test("a refused link stays shown through later polls until a link is accepted", () => {
  const rejected = connectionReducer(live, { kind: "linkRejected" });
  assert.deepEqual(rejected, { ...live, isLinkRejected: true });
  const polled = connectionReducer(rejected, { kind: "received", snapshot: later });
  assert.equal(polled.isLinkRejected, true);
  assert.deepEqual(connectionReducer(polled, { kind: "linkAccepted", snapshot: later }), {
    connection: "live",
    snapshot: later,
    isLinkRejected: false,
  });
});
