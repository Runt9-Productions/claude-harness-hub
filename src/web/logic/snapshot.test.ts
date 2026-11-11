import assert from "node:assert/strict";
import { test } from "node:test";
import type { Snapshot } from "../../shared/api.ts";
import { readRunSnapshot, readSnapshot } from "./snapshot.ts";

const body: Snapshot = {
  runId: "run-a",
  now: 1000,
  sessions: [],
  errors: [
    { source: "agents", message: "example failure" },
    { source: "stores", sessionId: "session-1", message: "example failure" },
  ],
};

void test("reads a snapshot body into an equal snapshot", () => {
  assert.deepEqual(readSnapshot(JSON.parse(JSON.stringify(body))), body);
});

void test("a body that does not fit the snapshot throws naming what does not fit", () => {
  assert.throws(() => readSnapshot({ ...body, runId: 7 }), /field runId is not a string/);
  assert.throws(() => readSnapshot({ ...body, now: "1000" }), /field now is not a number/);
  assert.throws(() => readSnapshot({ ...body, sessions: [{}] }), /field sessions is not an empty list/);
  assert.throws(() => readSnapshot({ ...body, sessions: {} }), /field sessions is not an empty list/);
  assert.throws(() => readSnapshot({ ...body, errors: null }), /field errors is not a list/);
  assert.throws(() => readSnapshot({ ...body, errors: [{ message: "x" }] }), /field source is not a string/);
  assert.throws(() => readSnapshot({ ...body, errors: [{ source: "agents" }] }), /field message is not a string/);
  assert.throws(
    () => readSnapshot({ ...body, errors: [{ source: "agents", sessionId: 1, message: "x" }] }),
    /field sessionId is not a string/,
  );
  assert.throws(() => readSnapshot([]), /snapshot is not an object/);
});

void test("a body from another run reads as restarted even when the rest does not fit, and one from this run is narrowed", () => {
  const unfit = { ...body, runId: "run-b", sessions: [{}] };
  assert.deepEqual(readRunSnapshot(unfit, "run-a"), { kind: "restarted" });
  assert.throws(() => readRunSnapshot(unfit, "run-b"), /field sessions is not an empty list/);
  assert.deepEqual(readRunSnapshot(body, undefined), { kind: "snapshot", snapshot: body });
  assert.throws(() => readRunSnapshot({ ...body, runId: 7 }, "run-a"), /field runId is not a string/);
});
