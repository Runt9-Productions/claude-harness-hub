import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createStoreSource, type SessionStores } from "./stores.ts";

const fixtureConfigDir = fileURLToPath(new URL("../../e2e/fixtures/.claude/", import.meta.url));
const fixtureList = fileURLToPath(new URL("../../e2e/fixtures/claude-agents.json", import.meta.url));

type StoreDirectory = { configDir: string; storeDir: string };

async function makeStoreDirectory(t: TestContext): Promise<StoreDirectory> {
  const configDir = await mkdtemp(join(tmpdir(), "hub-stores-test-"));
  t.after(() => rm(configDir, { recursive: true }));
  const storeDir = join(configDir, "plugins", "store");
  await mkdir(storeDir, { recursive: true });
  return { configDir, storeDir };
}

async function writeStore(storeDir: string, name: string, content: unknown): Promise<string> {
  const path = join(storeDir, name);
  await writeFile(path, JSON.stringify(content));
  return path;
}

function boardWithTask(title: string, savedAt: number): unknown {
  return { decisions: [], tasks: [{ id: "T1", title, status: "pending" }], ownerTasks: [], savedAt };
}

function taskTitles(stores: SessionStores | undefined): string[] | undefined {
  return stores?.board?.tasks.map((task) => task.title);
}

void test("reads the fixture stores for the fixture list's sessions", async () => {
  const listed = z.array(z.object({ sessionId: z.string() })).parse(JSON.parse(await readFile(fixtureList, "utf8")));
  const sessionIds = listed.map((row) => row.sessionId);

  const { sessions, errors } = await createStoreSource(fixtureConfigDir).read(sessionIds, 0);

  assert.deepEqual(errors, [], "the unlisted session's older shape raises nothing");
  const modes = sessionIds.map((sessionId) => sessions.get(sessionId)?.mode);
  assert.deepEqual(modes, [undefined, "away", "distracted", undefined]);
  assert.equal(sessions.get("fixture-session-beta")?.board, undefined);
  assert.deepEqual(sessions.get("fixture-session-alpha")?.board, {
    savedAt: 1794300300000,
    decisions: [
      {
        id: "D1",
        rev: 0,
        question: "Split the parser into a lexer and a reader?",
        context: "Splitting costs one more file; keeping it costs a longer function.",
        options: [
          { label: "Split it", description: "Two files, each under a hundred lines" },
          { label: "Keep one file" },
        ],
        recommended: 0,
        isAnswerKept: false,
      },
      {
        id: "D2",
        rev: 0,
        question: "Keep the old error messages?",
        options: [{ label: "Keep them" }, { label: "Reword them" }],
        recommended: 1,
        isAnswerKept: false,
        answer: "Reword them. Note: shorter ones",
        chosenOption: "Reword them",
        note: "shorter ones",
        delivery: "sent",
      },
    ],
    tasks: [
      {
        id: "T1",
        title: "Move the lexer out",
        status: "in_progress",
        holderId: "main",
        items: [
          { label: "Write the lexer", isTicked: true },
          { label: "Point the reader at it", isTicked: false },
        ],
      },
      {
        id: "T2",
        title: "Update the parser tests",
        status: "blocked",
        note: "Waits on the lexer",
        items: [{ label: "Rename the fixtures", isTicked: false }],
      },
      { id: "T3", title: "Read the old parser", status: "done", items: [] },
    ],
    ownerTasks: [
      {
        id: "O1",
        rev: 0,
        title: "Try the new parser on a sample file",
        description: "Any file from example.com will do.",
        items: [
          { label: "Run it once", isTicked: false },
          { label: "Compare the output", isTicked: false },
        ],
        isStartPressed: false,
        isDone: false,
      },
    ],
  });
  const gamma = sessions.get("fixture-session-gamma")?.board;
  assert.deepEqual(gamma?.ownerTasks[0]?.lastChange, { summary: 'ticked "Read the summary"', delivery: "seen" });
  const delta = sessions.get("fixture-session-delta")?.board;
  assert.deepEqual(delta?.decisions[0]?.options, [{ label: "Publish them" }, { label: "Wait for review" }]);
});

void test("an entry with an unknown shape is its session's error, and other sessions carry on", async (t) => {
  const { configDir, storeDir } = await makeStoreDirectory(t);
  const { question: _question, ...decisionWithoutQuestion } = { id: "D1", question: "Ship?", options: ["Yes", "No"] };
  await writeStore(storeDir, "board_one.json", {
    "session:fixture-one": { decisions: [decisionWithoutQuestion], tasks: [], ownerTasks: [], savedAt: 1 },
    "session:fixture-two": boardWithTask("Tidy up", 1),
    "session:fixture-unlisted": { decisions: "not a list" },
  });
  await writeStore(storeDir, "away_one.json", { "session:fixture-one": "elsewhere", "session:fixture-two": "away" });

  const { sessions, errors } = await createStoreSource(configDir).read(["fixture-one", "fixture-two"], 0);

  assert.deepEqual(sessions.get("fixture-one"), {});
  assert.deepEqual(taskTitles(sessions.get("fixture-two")), ["Tidy up"]);
  assert.equal(sessions.get("fixture-two")?.mode, "away");
  const described = errors.map((error) => `${error.source} ${error.sessionId}: ${error.message}`);
  assert.equal(described.length, 2);
  assert.match(described[0] ?? "", /^board store fixture-one: decisions\.0\.question: /);
  assert.match(described[1] ?? "", /^away store fixture-one: mode: /);
});

void test("takes the board entry with the newest savedAt and the mode from the newest away file", async (t) => {
  const { configDir, storeDir } = await makeStoreDirectory(t);
  await writeStore(storeDir, "board_a.json", {
    "session:fixture-one": boardWithTask("newer one", 2),
    "session:fixture-two": boardWithTask("older two", 1),
  });
  await writeStore(storeDir, "board_b.json", {
    "session:fixture-one": boardWithTask("older one", 1),
    "session:fixture-two": boardWithTask("newer two", 2),
  });
  const middle = await writeStore(storeDir, "away_a.json", {
    "session:fixture-one": "distracted",
    "session:fixture-two": "away",
  });
  const newest = await writeStore(storeDir, "away_b.json", { "session:fixture-two": "distracted" });
  const oldest = await writeStore(storeDir, "away_c.json", { "session:fixture-one": "away" });
  await utimes(oldest, 1000, 1000);
  await utimes(middle, 2000, 2000);
  await utimes(newest, 3000, 3000);

  const { sessions, errors } = await createStoreSource(configDir).read(["fixture-one", "fixture-two"], 0);

  assert.deepEqual(errors, []);
  assert.deepEqual(taskTitles(sessions.get("fixture-one")), ["newer one"]);
  assert.deepEqual(taskTitles(sessions.get("fixture-two")), ["newer two"]);
  assert.equal(sessions.get("fixture-one")?.mode, "distracted");
  assert.equal(sessions.get("fixture-two")?.mode, "distracted");
});

void test("parses a file again only when its modified time or size changed", async (t) => {
  const { configDir, storeDir } = await makeStoreDirectory(t);
  const stores = createStoreSource(configDir);
  const sessionIds = ["fixture-one", "fixture-two"];
  const path = await writeStore(storeDir, "away_one.json", { "session:fixture-one": "away" });
  await utimes(path, 1000, 1000);
  assert.equal((await stores.read(sessionIds, 0)).sessions.get("fixture-one")?.mode, "away");

  await writeStore(storeDir, "away_one.json", { "session:fixture-two": "away" });
  await utimes(path, 1000, 1000);
  const unchanged = await stores.read(sessionIds, 1);
  assert.equal(unchanged.sessions.get("fixture-one")?.mode, "away", "same time and size: the copy already read");

  await utimes(path, 2000, 2000);
  const touched = await stores.read(sessionIds, 2);
  assert.equal(touched.sessions.get("fixture-one")?.mode, undefined);
  assert.equal(touched.sessions.get("fixture-two")?.mode, "away");
});

void test("keeps the last good copy of a file that fails to parse, and reports it once it has failed for 10 seconds", async (t) => {
  const { configDir, storeDir } = await makeStoreDirectory(t);
  const stores = createStoreSource(configDir);
  const sessionIds = ["fixture-one"];
  const path = await writeStore(storeDir, "away_one.json", { "session:fixture-one": "away" });
  await stores.read(sessionIds, 0);
  await writeFile(path, '{"session:fixture-one": "dis');

  const withinGrace = await stores.read(sessionIds, 1000);
  const lastMoment = await stores.read(sessionIds, 10_999);
  const afterGrace = await stores.read(sessionIds, 11_000);
  await writeStore(storeDir, "away_one.json", { "session:fixture-one": "distracted" });
  const repaired = await stores.read(sessionIds, 12_000);

  assert.deepEqual(withinGrace, { sessions: new Map([["fixture-one", { mode: "away" }]]), errors: [] });
  assert.deepEqual(lastMoment.errors, []);
  assert.equal(afterGrace.sessions.get("fixture-one")?.mode, "away");
  assert.deepEqual(afterGrace.errors, [
    { source: "away store", message: "away_one.json has not read as a JSON object for 10000 ms" },
  ]);
  assert.deepEqual(repaired, { sessions: new Map([["fixture-one", { mode: "distracted" }]]), errors: [] });
});

void test("reads no boards and no errors from a config dir with no store directory", async (t) => {
  const configDir = await mkdtemp(join(tmpdir(), "hub-stores-test-"));
  t.after(() => rm(configDir, { recursive: true }));

  const read = await createStoreSource(configDir).read(["fixture-one"], 0);

  assert.deepEqual(read, { sessions: new Map([["fixture-one", {}]]), errors: [] });
});

void test("reports a store name that is a symbolic link and does not follow it", async (t) => {
  const { configDir, storeDir } = await makeStoreDirectory(t);
  const outside = await writeStore(configDir, "elsewhere.json", { "session:fixture-one": "away" });
  await symlink(outside, join(storeDir, "away_link.json"));

  const read = await createStoreSource(configDir).read(["fixture-one"], 0);

  assert.deepEqual(read, {
    sessions: new Map([["fixture-one", {}]]),
    errors: [{ source: "away store", message: "away_link.json is not a regular file" }],
  });
});
