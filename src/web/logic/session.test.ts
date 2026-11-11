import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionView } from "../../shared/api.ts";
import { sessionName } from "./session.ts";

const unnamed: SessionView = {
  key: "fixture-session",
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
};

void test("a session is named by its name, else its short id, else its key", () => {
  const names = [
    sessionName({ ...unnamed, name: "release notes", shortId: "fixs" }),
    sessionName({ ...unnamed, shortId: "fixs" }),
    sessionName(unnamed),
  ];
  assert.deepEqual(names, ["release notes", "fixs", "fixture-session"]);
});
