import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { createStoreSource, type SessionStores } from "./stores.ts";

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
  assert.match(described[1] ?? "", /^away store fixture-one: mode: Invalid option/);
});

void test("takes the board entry with the newest savedAt, a missing one as 0 and a tie to the first file by name, and the mode from the newest away file", async (t) => {
  const { configDir, storeDir } = await makeStoreDirectory(t);
  await writeStore(storeDir, "board_a.json", {
    "session:fixture-one": boardWithTask("newer one", 2),
    "session:fixture-two": boardWithTask("older two", 1),
    "session:fixture-three": boardWithTask("saved at 0", 0),
  });
  await writeStore(storeDir, "board_b.json", {
    "session:fixture-one": boardWithTask("older one", 1),
    "session:fixture-two": boardWithTask("newer two", 2),
    "session:fixture-three": { tasks: [{ id: "T1", title: "never saved", status: "pending" }] },
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

  const { sessions, errors } = await createStoreSource(configDir).read(
    ["fixture-one", "fixture-two", "fixture-three"],
    0,
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(taskTitles(sessions.get("fixture-one")), ["newer one"]);
  assert.deepEqual(taskTitles(sessions.get("fixture-two")), ["newer two"]);
  assert.deepEqual(taskTitles(sessions.get("fixture-three")), ["saved at 0"]);
  assert.equal(sessions.get("fixture-one")?.mode, "distracted");
  assert.equal(sessions.get("fixture-two")?.mode, "distracted");
});

void test("parses a file again only when its modified time or size changed, and forgets one that is gone", async (t) => {
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

  await rm(path);
  const gone = await stores.read(sessionIds, 3);
  assert.equal(gone.sessions.get("fixture-two")?.mode, undefined);
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

void test("a missing store directory reads as no stores and no error, and one that cannot be listed is an error", async (t) => {
  const configDir = await mkdtemp(join(tmpdir(), "hub-stores-test-"));
  t.after(() => rm(configDir, { recursive: true }));

  const missing = await createStoreSource(configDir).read(["fixture-one"], 0);
  await mkdir(join(configDir, "plugins"));
  await writeFile(join(configDir, "plugins", "store"), "not a directory");
  const unlistable = await createStoreSource(configDir).read(["fixture-one"], 0);

  assert.deepEqual(missing, { sessions: new Map([["fixture-one", {}]]), errors: [] });
  assert.deepEqual(unlistable, {
    sessions: new Map([["fixture-one", {}]]),
    errors: [{ source: "stores", message: "could not list the store directory: ENOTDIR" }],
  });
});

void test("reads only regular files with a store's name, and reports a store name that is a symbolic link without following it", async (t) => {
  const { configDir, storeDir } = await makeStoreDirectory(t);
  await writeStore(storeDir, "notes.json", { "session:fixture-one": "away" });
  const outside = await writeStore(configDir, "elsewhere.json", { "session:fixture-one": "away" });
  await symlink(outside, join(storeDir, "away_link.json"));

  const read = await createStoreSource(configDir).read(["fixture-one"], 0);

  assert.deepEqual(read, {
    sessions: new Map([["fixture-one", {}]]),
    errors: [{ source: "away store", message: "away_link.json is not a regular file" }],
  });
});
