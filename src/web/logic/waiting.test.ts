import assert from "node:assert/strict";
import { test } from "node:test";
import type { DecisionView, OwnerTaskView, SessionView } from "../../shared/api.ts";
import { heldLine, rowAge, waitingList, waitingTotal, type WaitingRow } from "./waiting.ts";

function session(key: string, fields: Partial<SessionView> = {}): SessionView {
  return {
    key,
    cwd: "/srv/example",
    kind: "interactive",
    startedAt: 1000,
    isProcessAlive: true,
    decisions: [],
    ownerTasks: [],
    tasks: [],
    needsYou: false,
    waitingCount: 0,
    hasUnreadAnswers: false,
    canAnswer: false,
    canSetMode: false,
    ...fields,
  };
}

function decision(id: string, fields: Partial<DecisionView> = {}): DecisionView {
  return { id, rev: 1, question: `Question ${id}?`, options: [], isAnswerKept: false, isWaiting: true, ...fields };
}

function ownerTask(id: string, fields: Partial<OwnerTaskView> = {}): OwnerTaskView {
  return {
    id,
    rev: 1,
    title: `Task ${id}`,
    items: [],
    isStartPressed: false,
    isDone: false,
    isWaiting: true,
    ...fields,
  };
}

function keys(rows: readonly WaitingRow<unknown>[]): string[] {
  return rows.map((row) => row.key);
}

void test("only waiting items are listed, each keyed by session and kind", () => {
  const list = waitingList([
    session("fixture-a", {
      decisions: [decision("D1"), decision("D2", { isWaiting: false })],
      ownerTasks: [ownerTask("O1"), ownerTask("O2", { isWaiting: false })],
    }),
    session("fixture-b", { startedAt: 2000, decisions: [decision("D1")] }),
  ]);
  assert.deepEqual(keys(list.decisions), ["fixture-a/decision/D1", "fixture-b/decision/D1"]);
  assert.deepEqual(keys(list.ownerTasks), ["fixture-a/owner-task/O1"]);
});

void test("each list runs oldest first: by createdAt or the session's start, created items first, then id number with unnumbered ids last, then id", () => {
  const list = waitingList([
    session("early", {
      startedAt: 1000,
      decisions: [
        decision("flag"),
        decision("D10"),
        decision("E2"),
        decision("D2"),
        decision("D7", { createdAt: 3000 }),
      ],
      ownerTasks: [ownerTask("O2", { createdAt: 4000 })],
    }),
    session("late", {
      startedAt: 5000,
      decisions: [decision("D4"), decision("D9", { createdAt: 1000 }), decision("D3", { createdAt: 500 })],
      ownerTasks: [ownerTask("O1", { createdAt: 2000 })],
    }),
  ]);
  assert.deepEqual(keys(list.decisions), [
    "late/decision/D3",
    "late/decision/D9",
    "early/decision/D2",
    "early/decision/E2",
    "early/decision/D10",
    "early/decision/flag",
    "early/decision/D7",
    "late/decision/D4",
  ]);
  assert.deepEqual(keys(list.ownerTasks), ["late/owner-task/O1", "early/owner-task/O2"]);
});

void test("sessions waiting in their terminal are held, by start, with what they wait on", () => {
  const list = waitingList([
    session("late-held", { startedAt: 3000, status: "waiting", waitingFor: "permission prompt" }),
    session("busy", { startedAt: 2000, status: "busy" }),
    session("early-held", { startedAt: 1000, status: "waiting" }),
  ]);
  assert.deepEqual(
    list.held.map((held) => [held.key, held.waitingFor]),
    [
      ["early-held", undefined],
      ["late-held", "permission prompt"],
    ],
  );
});

void test("a held session says what it waits on when the session list names it, and to answer it in its terminal", () => {
  const list = waitingList([
    session("prompted", { name: "export button", status: "waiting", waitingFor: "permission prompt" }),
    session("fixture-held", { startedAt: 2000, status: "waiting" }),
  ]);
  assert.deepEqual(list.held.map(heldLine), [
    "export button is waiting: permission prompt. Answer it in its terminal.",
    "fixture-held is waiting. Answer it in its terminal.",
  ]);
});

void test("the switcher counts every session's waiting items, and a held session adds nothing of its own", () => {
  const sessions = [
    session("busy", { waitingCount: 2 }),
    session("held-with-items", { status: "waiting", waitingCount: 1 }),
    session("held", { status: "waiting" }),
  ];
  assert.equal(waitingTotal(sessions), 3);
});

void test("a row's age rounds down to whole minutes, hours past an hour and days past a day, and is absent without createdAt", () => {
  const minute = 60_000;
  const now = 30 * 24 * 60 * minute;
  const elapsed = [
    59 * minute + 59_000,
    60 * minute,
    23 * 60 * minute + 59 * minute,
    24 * 60 * minute,
    47 * 60 * minute,
  ];
  assert.deepEqual(
    elapsed.map((elapsedMs) => rowAge(now - elapsedMs, now)),
    ["59m", "1h", "23h", "1d", "1d"],
  );
  assert.equal(rowAge(undefined, now), undefined);
});
