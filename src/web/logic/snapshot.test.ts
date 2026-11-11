import assert from "node:assert/strict";
import { test } from "node:test";
import type { Snapshot } from "../../shared/api.ts";
import { readRunId, readSnapshot } from "./snapshot.ts";

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

void test("readRunId reads the runId from a body whose other fields do not fit, and throws on one that is not a string", () => {
  assert.equal(readRunId({ runId: "run-b", sessions: [{}] }), "run-b");
  assert.throws(() => readRunId({ ...body, runId: 7 }), /field runId is not a string/);
});
