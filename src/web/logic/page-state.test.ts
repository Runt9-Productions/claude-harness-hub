import assert from "node:assert/strict";
import { test } from "node:test";
import type { DecisionView, OwnerTaskView, SessionView, Snapshot } from "../../shared/api.ts";
import { initialPageState, openRowKey, pageReducer, type PageState } from "./page-state.ts";
import { waitingList, type WaitingList } from "./waiting.ts";

const snapshot: Snapshot = { runId: "run-a", now: 1000, sessions: [], errors: [] };

void test("a card toggles open and shut, and a new snapshot or link leaves it as the owner set it", () => {
  const expanded = pageReducer(initialPageState("#/"), { kind: "cardToggled", key: "session-1" });
  const received = pageReducer(expanded, { kind: "received", snapshot });
  assert.equal(received.connection, "live");
  assert.equal(received.snapshot, snapshot);
  const relinked = pageReducer(received, { kind: "linkAccepted", snapshot });
  assert.deepEqual([...relinked.expandedCards], ["session-1"]);
  const collapsed = pageReducer(relinked, { kind: "cardToggled", key: "session-1" });
  assert.deepEqual([...collapsed.expandedCards], []);
});

void test("the route is read from the hash on load and again when it changes", () => {
  const launched = initialPageState("#t=abc");
  assert.equal(launched.route, "unknown");
  assert.equal(pageReducer(launched, { kind: "routeChanged", hash: "#/waiting" }).route, "waiting");
});

function boardSession(key: string, decisionIds: string[], ownerTaskIds: string[]): SessionView {
  const decisions = decisionIds.map((id): DecisionView => ({
    id,
    rev: 1,
    question: `Question ${id}?`,
    options: [],
    isAnswerKept: false,
    isWaiting: true,
  }));
  const ownerTasks = ownerTaskIds.map((id): OwnerTaskView => ({
    id,
    rev: 1,
    title: `Task ${id}`,
    items: [],
    isStartPressed: false,
    isDone: false,
    isWaiting: true,
  }));
  return {
    key,
    cwd: "/srv/example",
    kind: "interactive",
    startedAt: 1000,
    isProcessAlive: true,
    decisions,
    ownerTasks,
    tasks: [],
    needsYou: true,
    waitingCount: decisionIds.length + ownerTaskIds.length,
    hasUnreadAnswers: false,
    canAnswer: false,
    canSetMode: false,
  };
}

function listOf(decisionIds: string[], ownerTaskIds: string[]): WaitingList {
  return waitingList([boardSession("fixture-a", decisionIds, ownerTaskIds)]);
}

function openKey(state: PageState, list: WaitingList): string | undefined {
  return openRowKey(state.openRow, list);
}

void test("with no row chosen the oldest decision is open, else the oldest task, else none", () => {
  const state = initialPageState("#/waiting");
  assert.equal(openKey(state, listOf(["D1", "D2"], ["O1"])), "fixture-a/decision/D1");
  assert.equal(openKey(state, listOf([], ["O1", "O2"])), "fixture-a/owner-task/O1");
  assert.equal(openKey(state, listOf([], [])), undefined);
});

void test("the opened row stays open across snapshots while listed, and the first row opens once it leaves", () => {
  const opened = pageReducer(initialPageState("#/waiting"), { kind: "rowOpened", key: "fixture-a/owner-task/O1" });
  const received = pageReducer(opened, { kind: "received", snapshot });
  assert.equal(openKey(received, listOf(["D1"], ["O1"])), "fixture-a/owner-task/O1");
  assert.equal(openKey(received, listOf(["D1"], [])), "fixture-a/decision/D1");
});

void test("opening a row closes the open one, and closing the open row leaves none open", () => {
  const list = listOf(["D1", "D2"], ["O1"]);
  const first = pageReducer(initialPageState("#/waiting"), { kind: "rowOpened", key: "fixture-a/decision/D2" });
  const second = pageReducer(first, { kind: "rowOpened", key: "fixture-a/owner-task/O1" });
  assert.equal(openKey(second, list), "fixture-a/owner-task/O1");
  const closed = pageReducer(second, { kind: "rowClosed" });
  assert.equal(openKey(closed, list), undefined);
});
