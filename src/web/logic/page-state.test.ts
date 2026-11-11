import assert from "node:assert/strict";
import { test } from "node:test";
import type { Snapshot } from "../../shared/api.ts";
import { initialPageState, pageReducer } from "./page-state.ts";

const snapshot: Snapshot = { runId: "run-a", now: 1000, sessions: [], errors: [] };

void test("a card toggles open and shut, and a new snapshot or link leaves it as the owner set it", () => {
  const expanded = pageReducer(initialPageState, { kind: "cardToggled", key: "session-1" });
  const received = pageReducer(expanded, { kind: "received", snapshot });
  assert.equal(received.connection, "live");
  assert.equal(received.snapshot, snapshot);
  const relinked = pageReducer(received, { kind: "linkAccepted", snapshot });
  assert.deepEqual([...relinked.expandedCards], ["session-1"]);
  const collapsed = pageReducer(relinked, { kind: "cardToggled", key: "session-1" });
  assert.deepEqual([...collapsed.expandedCards], []);
});
