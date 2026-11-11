import assert from "node:assert/strict";
import { test } from "node:test";
import type { DecisionView, OwnerTaskView, SessionView, TaskView } from "../../shared/api.ts";
import {
  cardTasks,
  columnCount,
  countByState,
  dealIntoColumns,
  groupSessions,
  placeErrors,
  waitingCount,
} from "./dashboard.ts";

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
    hasUnreadAnswers: false,
    canAnswer: false,
    canSetMode: false,
    ...fields,
  };
}

function keys(sessions: readonly SessionView[]): string[] {
  return sessions.map((listed) => listed.key);
}

void test("sessions that need the owner come first, and each group runs oldest first", () => {
  const groups = groupSessions([
    session("late-rest", { startedAt: 3000 }),
    session("late-need", { startedAt: 4000, needsYou: true }),
    session("early-rest", { startedAt: 1000 }),
    session("early-need", { startedAt: 2000, needsYou: true }),
  ]);
  assert.deepEqual(keys(groups.needsYou), ["early-need", "late-need"]);
  assert.deepEqual(keys(groups.everythingElse), ["early-rest", "late-rest"]);
});

void test("counts sessions by the state each card shows, the states that need the owner first", () => {
  const counts = countByState([
    session("idle", { status: "idle" }),
    session("busy", { status: "busy" }),
    session("background-busy", { kind: "background", state: "working", status: "busy" }),
    session("stopped", { kind: "background", state: "stopped", isProcessAlive: false }),
    session("prompt", { kind: "background", state: "working", status: "waiting", waitingFor: "permission prompt" }),
    session("blocked", { kind: "background", state: "blocked", isProcessAlive: false }),
  ]);
  assert.deepEqual(counts, [
    ["waiting", 1],
    ["blocked", 1],
    ["working", 2],
    ["idle", 1],
    ["stopped", 1],
  ]);
});

void test("a 1920 pixel screen fits 4 columns and a narrow one still gets one", () => {
  assert.equal(columnCount(1920), 4);
  assert.equal(columnCount(320), 1);
});

void test("cards are dealt left to right across the columns, and one card leaves the other columns empty", () => {
  assert.deepEqual(dealIntoColumns(["a", "b", "c", "d", "e"], 2), [
    ["a", "c", "e"],
    ["b", "d"],
  ]);
  assert.deepEqual(dealIntoColumns(["a"], 4), [["a"], [], [], []]);
});

function task(id: string, status: string): TaskView {
  return { id, title: `Task ${id}`, status, items: [] };
}

void test("a card shows 3 open tasks with blocked ones first, and every open task once expanded", () => {
  const tasks = [
    task("T1", "pending"),
    task("T2", "in_progress"),
    task("T3", "done"),
    task("T4", "blocked"),
    task("T5", "pending"),
  ];
  const collapsed = cardTasks(tasks, false);
  assert.deepEqual(
    collapsed.shown.map((shown) => shown.id),
    ["T4", "T1", "T2"],
  );
  assert.deepEqual(
    {
      open: collapsed.openCount,
      hidden: collapsed.hiddenCount,
      done: collapsed.doneCount,
      blocked: collapsed.blockedCount,
    },
    { open: 4, hidden: 1, done: 1, blocked: 1 },
  );
  const expanded = cardTasks(tasks, true);
  assert.deepEqual(
    expanded.shown.map((shown) => shown.id),
    ["T4", "T1", "T2", "T5"],
  );
  assert.equal(expanded.hiddenCount, 0);
});

void test("an error for a session with a card goes to that card, and any other error goes under the top bar", () => {
  const forCard = { source: "board store", sessionId: "listed", message: "example failure" };
  const forNobody = { source: "claude agents", message: "example failure" };
  const forHidden = { source: "claude agents", sessionId: "not-listed", message: "example failure" };
  const placed = placeErrors([forCard, forNobody, forHidden], [session("listed")]);
  assert.deepEqual([...placed.bySession], [["listed", [forCard]]]);
  assert.deepEqual(placed.general, [forNobody, forHidden]);
});

void test("the waiting count holds unanswered decisions and unfinished owner tasks", () => {
  const decision: DecisionView = { id: "D1", rev: 0, question: "Ship it?", options: [], isAnswerKept: false };
  const ownerTask: OwnerTaskView = {
    id: "O1",
    rev: 0,
    title: "Try it",
    items: [],
    isStartPressed: false,
    isDone: false,
  };
  const counted = session("counted", {
    decisions: [decision, { ...decision, id: "D2", answer: "Yes" }],
    ownerTasks: [ownerTask, { ...ownerTask, id: "O2", isDone: true }],
  });
  assert.equal(waitingCount(counted), 2);
});
