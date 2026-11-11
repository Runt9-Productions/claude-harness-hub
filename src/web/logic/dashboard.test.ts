import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionView, TaskView } from "../../shared/api.ts";
import {
  cardTasks,
  columnCount,
  countByState,
  groupSessions,
  isSamePlacement,
  placeErrors,
  placeInColumns,
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
    waitingCount: 0,
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
    session("paused", { kind: "background", state: "paused", isProcessAlive: false }),
    session("blocked", { kind: "background", state: "blocked", isProcessAlive: false }),
  ]);
  assert.deepEqual(counts, [
    ["waiting", 1],
    ["blocked", 1],
    ["working", 2],
    ["idle", 1],
    ["stopped", 1],
    ["paused", 1],
  ]);
});

void test("a 1920 pixel screen fits 4 columns and a narrow one still gets one", () => {
  assert.equal(columnCount(1920), 4);
  assert.equal(columnCount(320), 1);
});

function cards(...cardKeys: string[]): SessionView[] {
  return cardKeys.map((key) => session(key));
}

function columnKeys(columns: readonly (readonly SessionView[])[]): string[][] {
  return columns.map(keys);
}

void test("a card entering a group takes the column with the fewest cards, and one leaving moves no other card", () => {
  const first = placeInColumns(cards("a", "b", "c", "d", "e"), 2, []);
  assert.deepEqual(columnKeys(first), [
    ["a", "c", "e"],
    ["b", "d"],
  ]);
  const afterLeaving = placeInColumns(cards("a", "c", "d", "e"), 2, first);
  assert.deepEqual(columnKeys(afterLeaving), [["a", "c", "e"], ["d"]]);
  const afterEntering = placeInColumns(cards("a", "c", "d", "e", "f"), 2, afterLeaving);
  assert.deepEqual(columnKeys(afterEntering), [
    ["a", "c", "e"],
    ["d", "f"],
  ]);
});

void test("placing the same cards again matches the held placement, and a card that moved does not", () => {
  const held = [cards("a", "c"), cards("b")];
  const placedAgain = placeInColumns(cards("a", "b", "c"), 2, held);
  assert.equal(isSamePlacement(placedAgain, held), true);
  assert.equal(isSamePlacement([cards("a"), cards("b", "c")], held), false);
});

void test("a new column count places every card afresh", () => {
  const twoColumns = [cards("a", "c", "e"), cards("d", "f")];
  const threeColumns = placeInColumns(cards("a", "c", "d", "e", "f"), 3, twoColumns);
  assert.deepEqual(columnKeys(threeColumns), [["a", "e"], ["c", "f"], ["d"]]);
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
