import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSnapshot, type ListedSession, type StoredSession } from "./snapshot.ts";

const unansweredDecision = { id: "D1", rev: 0, question: "Example?", options: [{ label: "Yes" }], isAnswerKept: false };
const answeredDecision = { ...unansweredDecision, answer: "Yes", chosenOption: "Yes", delivery: "seen" as const };
const openOwnerTask = { id: "O1", rev: 0, title: "Example", items: [], isStartPressed: false, isDone: false };
const doneOwnerTask = { ...openOwnerTask, isDone: true };

function row(sessionId: string, fields: Partial<ListedSession> = {}): ListedSession {
  return { cwd: "/srv/example", kind: "background", startedAt: 1000, sessionId, ...fields };
}

function build(rows: ListedSession[], stored: Record<string, StoredSession> = {}) {
  const sessions = new Map<string, StoredSession>();
  for (const listed of rows) {
    if (listed.sessionId !== undefined) sessions.set(listed.sessionId, stored[listed.sessionId] ?? {});
  }
  return buildSnapshot({
    runId: "run-a",
    now: 2000,
    list: { rows, errors: [{ source: "claude agents", message: "example list failure" }] },
    stores: { sessions, errors: [{ source: "board store", message: "example store failure" }] },
  });
}

function boardWith(decisions: (typeof unansweredDecision)[], ownerTasks: (typeof openOwnerTask)[]): StoredSession {
  return { board: { decisions, tasks: [], ownerTasks } };
}

void test("a row with a process always shows; one without shows while working or blocked, or ended with owner work left", () => {
  const snapshot = build(
    [
      row("live", { pid: 1 }),
      row("working", { state: "working" }),
      row("blocked", { state: "blocked" }),
      row("stopped-with-decision", { state: "stopped" }),
      row("done-with-owner-task", { state: "done" }),
      row("failed-with-finished-work", { state: "failed" }),
      row("done-without-board", { state: "done" }),
      row("unknown-state-with-decision", { state: "paused" }),
      row("no-state-with-decision", {}),
    ],
    {
      "stopped-with-decision": boardWith([unansweredDecision], []),
      "done-with-owner-task": boardWith([], [openOwnerTask]),
      "failed-with-finished-work": boardWith([answeredDecision], [doneOwnerTask]),
      "unknown-state-with-decision": boardWith([unansweredDecision], []),
      "no-state-with-decision": boardWith([unansweredDecision], []),
    },
  );
  const shown = snapshot.sessions.map((session) => session.key);
  assert.deepEqual(shown, ["live", "working", "blocked", "stopped-with-decision", "done-with-owner-task"]);
});

void test("a session needs the owner for an unanswered decision, an unfinished owner task, a waiting status or a blocked state", () => {
  const snapshot = build(
    [
      row("idle", { pid: 1, status: "idle" }),
      row("waiting", { pid: 1, status: "waiting" }),
      row("blocked", { pid: 1, state: "blocked" }),
      row("decision", { pid: 1 }),
      row("owner-task", { pid: 1 }),
      row("finished-work", { pid: 1, state: "working" }),
    ],
    {
      decision: boardWith([unansweredDecision], []),
      "owner-task": boardWith([], [openOwnerTask]),
      "finished-work": boardWith([answeredDecision], [doneOwnerTask]),
    },
  );
  const needsYou = snapshot.sessions.map((session) => [session.key, session.needsYou]);
  assert.deepEqual(needsYou, [
    ["idle", false],
    ["waiting", true],
    ["blocked", true],
    ["decision", true],
    ["owner-task", true],
    ["finished-work", false],
  ]);
});

void test("an unanswered decision and an unfinished owner task are waiting, answered and done ones are not, and the count holds the waiting ones", () => {
  const [session] = build([row("mixed", { pid: 1 })], {
    mixed: boardWith([unansweredDecision, answeredDecision], [openOwnerTask, doneOwnerTask]),
  }).sessions;
  assert.deepEqual(
    session?.decisions.map((decision) => decision.isWaiting),
    [true, false],
  );
  assert.deepEqual(
    session.ownerTasks.map((ownerTask) => ownerTask.isWaiting),
    [true, false],
  );
  assert.equal(session.waitingCount, 2);
});

void test("only named fields reach the view: no agentId, and no note before a decision is answered", () => {
  const draftNote = { ...unansweredDecision, agentId: "worker", note: "an unsent draft" };
  const answeredBySubagent = {
    ...answeredDecision,
    id: "D2",
    agentId: "worker",
    note: "shorter",
    delivery: "sent" as const,
  };
  const ownerTask = {
    ...openOwnerTask,
    agentId: "worker",
    lastChange: { summary: "ticked", delivery: "sent" as const },
  };
  const stored = { board: { decisions: [draftNote, answeredBySubagent], tasks: [], ownerTasks: [ownerTask] } };
  const [session] = build([row("example", { pid: 1 })], { example: stored }).sessions;
  assert.deepEqual(session?.decisions, [
    { ...unansweredDecision, isWaiting: true },
    { ...answeredDecision, id: "D2", isWaiting: false, note: "shorter", delivery: "sent" },
  ]);
  assert.deepEqual(session.ownerTasks, [
    { ...openOwnerTask, isWaiting: true, lastChange: { summary: "ticked", delivery: "sent" } },
  ]);
  assert.equal(session.hasUnreadAnswers, false, "an answer sent to a subagent is not the main agent's unread answer");
});

void test("an owner task change sent to the main agent is unread, and a seen answer is not", () => {
  const sentOwnerTask = { ...openOwnerTask, lastChange: { summary: "ticked", delivery: "sent" as const } };
  const snapshot = build([row("owner-task", { pid: 1 }), row("seen", { pid: 1 })], {
    "owner-task": boardWith([], [sentOwnerTask]),
    seen: boardWith([answeredDecision], []),
  });
  const unread = snapshot.sessions.map((session) => [session.key, session.hasUnreadAnswers]);
  assert.deepEqual(unread, [
    ["owner-task", true],
    ["seen", false],
  ]);
});

void test("the key is sessionId, else the short id; a row with neither is an error and the rest still build", () => {
  const snapshot = build([
    row("example", { pid: 1, id: "short-a" }),
    { cwd: "/srv/example", kind: "background", startedAt: 1000, id: "short-b", state: "working" },
    { cwd: "/srv/example", kind: "background", startedAt: 1000, state: "working" },
  ]);
  assert.deepEqual(
    snapshot.sessions.map((session) => session.key),
    ["example", "short-b"],
  );
  assert.deepEqual(snapshot.errors, [
    { source: "claude agents", message: "example list failure" },
    { source: "board store", message: "example store failure" },
    { source: "claude agents", message: "a row has neither sessionId nor id" },
  ]);
});
