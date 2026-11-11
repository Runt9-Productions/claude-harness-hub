import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionView, Snapshot } from "../../shared/api.ts";
import { readRunSnapshot, readSnapshot } from "./snapshot.ts";

const minimalSession: SessionView = {
  key: "fixture-short",
  cwd: "/srv/example/one",
  kind: "background",
  startedAt: 1000,
  isProcessAlive: false,
  decisions: [],
  ownerTasks: [],
  tasks: [],
  needsYou: false,
  waitingCount: 0,
  hasUnreadAnswers: false,
  canAnswer: false,
  canSetMode: false,
};

// Every optional field present, so a field the reader drops or misnames fails the round trip.
const fullSession: SessionView = {
  key: "fixture-session-1",
  sessionId: "fixture-session-1",
  shortId: "fixshort",
  name: "Example session",
  cwd: "/srv/example/two",
  kind: "interactive",
  startedAt: 2000,
  isProcessAlive: true,
  status: "waiting",
  state: "working",
  waitingFor: "permission prompt",
  mode: "away",
  decisions: [
    {
      id: "D1",
      rev: 2,
      createdAt: 1500,
      question: "Ship it?",
      context: "It passes on example.com.",
      options: [{ label: "Ship", description: "Today" }, { label: "Wait" }],
      recommended: 0,
      askedBy: "main",
      plugin: "watcher",
      isAnswerKept: true,
      isWaiting: false,
      answer: "Ship. Note: soon",
      chosenOption: "Ship",
      note: "soon",
      delivery: "seen",
    },
  ],
  ownerTasks: [
    {
      id: "O1",
      rev: 1,
      createdAt: 1600,
      title: "Try it",
      description: "Once.",
      postedBy: "main",
      items: [{ label: "Run it", isTicked: true }],
      isStartPressed: true,
      isDone: false,
      isWaiting: true,
      lastChange: { summary: "ticked", delivery: "sent" },
    },
  ],
  tasks: [{ id: "T1", title: "Write it", status: "blocked", note: "Waits", holderId: "main", items: [] }],
  needsYou: true,
  waitingCount: 1,
  hasUnreadAnswers: true,
  canAnswer: false,
  canSetMode: false,
};

const body: Snapshot = {
  runId: "run-a",
  now: 1000,
  sessions: [fullSession, minimalSession],
  errors: [
    { source: "agents", message: "example failure" },
    { source: "stores", sessionId: "session-1", message: "example failure" },
  ],
};

function withSession(fields: Record<string, unknown>): unknown {
  return { ...body, sessions: [{ ...fullSession, ...fields }] };
}

void test("reads a snapshot body into an equal snapshot", () => {
  assert.deepEqual(readSnapshot(JSON.parse(JSON.stringify(body))), body);
});

void test("a field the snapshot does not define is left out", () => {
  const read = readSnapshot(withSession({ agentId: "main" }));
  assert.deepEqual(read.sessions, [fullSession]);
});

void test("a body that does not fit the snapshot throws naming what does not fit", () => {
  assert.throws(() => readSnapshot({ ...body, runId: 7 }), /field runId is not a string/);
  assert.throws(() => readSnapshot({ ...body, now: "1000" }), /field now is not a number/);
  assert.throws(() => readSnapshot({ ...body, sessions: {} }), /field sessions is not a list/);
  assert.throws(() => readSnapshot({ ...body, errors: null }), /field errors is not a list/);
  assert.throws(() => readSnapshot({ ...body, errors: [{ message: "x" }] }), /field source is not a string/);
  assert.throws(() => readSnapshot({ ...body, errors: [{ source: "agents" }] }), /field message is not a string/);
  assert.throws(
    () => readSnapshot({ ...body, errors: [{ source: "agents", sessionId: 1, message: "x" }] }),
    /field sessionId is not a string/,
  );
  assert.throws(() => readSnapshot([]), /snapshot is not an object/);
});

void test("a session that does not fit throws with the path to the field", () => {
  const { cwd: _cwd, ...withoutCwd } = fullSession;
  assert.throws(
    () => readSnapshot({ ...body, sessions: [withoutCwd] }),
    /^Error: snapshot field sessions entry 0 field cwd is not a string$/,
  );
  assert.throws(
    () => readSnapshot(withSession({ mode: "elsewhere" })),
    /field mode is not one of present, distracted, away/,
  );
  assert.throws(() => readSnapshot(withSession({ isProcessAlive: "yes" })), /field isProcessAlive is not a boolean/);
  assert.throws(
    () => readSnapshot(withSession({ decisions: [{ ...fullSession.decisions[0], delivery: "lost" }] })),
    /field decisions entry 0 field delivery is not one of/,
  );
  assert.throws(
    () => readSnapshot(withSession({ decisions: [{ ...fullSession.decisions[0], isWaiting: undefined }] })),
    /field decisions entry 0 field isWaiting is not a boolean/,
  );
  assert.throws(
    () => readSnapshot(withSession({ ownerTasks: [{ ...fullSession.ownerTasks[0], isWaiting: undefined }] })),
    /field ownerTasks entry 0 field isWaiting is not a boolean/,
  );
  assert.throws(
    () => readSnapshot(withSession({ ownerTasks: [{ ...fullSession.ownerTasks[0], items: [{ label: "Run it" }] }] })),
    /field ownerTasks entry 0 field items entry 0 field isTicked is not a boolean/,
  );
  assert.throws(
    () => readSnapshot(withSession({ tasks: [{ id: "T1", title: "x", status: "done" }] })),
    /field items is not a list/,
  );
});

void test("a body from another run reads as restarted even when the rest does not fit, and one from this run is narrowed", () => {
  const unfit = { ...body, runId: "run-b", sessions: {} };
  assert.deepEqual(readRunSnapshot(unfit, "run-a"), { kind: "restarted" });
  assert.throws(() => readRunSnapshot(unfit, "run-b"), /field sessions is not a list/);
  assert.deepEqual(readRunSnapshot(body, undefined), { kind: "snapshot", snapshot: body });
  assert.throws(() => readRunSnapshot({ ...body, runId: 7 }, "run-a"), /field runId is not a string/);
});
