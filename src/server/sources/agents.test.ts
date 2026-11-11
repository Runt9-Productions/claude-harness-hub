import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createSessionListSource, type SessionList, type SessionListSource } from "./agents.ts";

const fixtureBin = fileURLToPath(new URL("../../e2e/fixtures/bin/", import.meta.url));
const fixtureList = fileURLToPath(new URL("../../e2e/fixtures/claude-agents.json", import.meta.url));

const goodRow = {
  cwd: "/srv/example/one",
  kind: "interactive",
  startedAt: 1794300000000,
  sessionId: "fixture-one",
  pid: 42001,
  status: "idle",
};

async function makeDirectory(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "hub-agents-test-"));
  t.after(() => rm(directory, { recursive: true }));
  return directory;
}

async function writeScript(path: string, body: string): Promise<void> {
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
}

function putFirstOnPath(t: TestContext, directories: string[]): void {
  const originalPath = process.env["PATH"];
  process.env["PATH"] = [...directories, originalPath].join(delimiter);
  t.after(() => {
    process.env["PATH"] = originalPath;
  });
}

/** Puts a `claude` running `body` first on PATH and returns its path, so a test can rewrite it. */
async function stubClaude(t: TestContext, body: string): Promise<string> {
  const directory = await makeDirectory(t);
  const stub = join(directory, "claude");
  await writeScript(stub, body);
  putFirstOnPath(t, [directory]);
  return stub;
}

function printing(list: unknown[]): string {
  return `cat <<'LIST'\n${JSON.stringify(list)}\nLIST`;
}

async function readUntil(
  sessions: SessionListSource,
  now: number,
  isWanted: (list: SessionList) => boolean,
): Promise<SessionList> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const list = await sessions.read(now);
    if (isWanted(list)) return list;
    await sleep(20);
  }
  throw new Error(`no read at ${now} gave the wanted list`);
}

void test("reads the fixture list from the stub claude, passing over relative entries and node_modules/.bin ones", async (t) => {
  const directory = await makeDirectory(t);
  const decoyBin = join(directory, "node_modules", ".bin");
  const relativeDecoy = join(directory, "relative");
  for (const decoy of [decoyBin, relativeDecoy]) {
    await mkdir(decoy, { recursive: true });
    await writeScript(join(decoy, "claude"), printing([]));
  }
  // claude runs from the home directory, so this relative entry would reach the decoy if it were kept.
  const relativeEntry = relative(homedir(), relativeDecoy);
  putFirstOnPath(t, [relativeEntry, `${decoyBin}/`, decoyBin, fixtureBin]);
  const expectedRows: unknown = JSON.parse(await readFile(fixtureList, "utf8"));

  const list = await createSessionListSource().read(0);

  assert.deepEqual(list, { rows: expectedRows, errors: [] });
});

void test("keeps a row whose kind, status, state and waitingFor are unknown, with an error naming each field", async (t) => {
  const row = { ...goodRow, kind: "remote", status: "thinking", state: "paused", waitingFor: "a reply" };
  await stubClaude(t, printing([row]));

  const list = await createSessionListSource().read(0);

  assert.deepEqual(list.rows, [row]);
  const messages = list.errors.map((error) => `${error.sessionId}: ${error.message}`).toSorted();
  assert.deepEqual(messages, [
    "fixture-one: unknown kind value",
    "fixture-one: unknown state value",
    "fixture-one: unknown status value",
    "fixture-one: unknown waitingFor value",
  ]);
});

void test("drops each row the schema rejects, naming it by sessionId, else id, else its place in the list", async (t) => {
  const { cwd: _cwd, ...rowWithoutCwd } = { ...goodRow, sessionId: "fixture-two" };
  const rowWithNumericSessionId = { ...rowWithoutCwd, sessionId: 7, id: "fixture-three" };
  await stubClaude(t, printing(["not a row", rowWithoutCwd, rowWithNumericSessionId, goodRow]));

  const list = await createSessionListSource().read(0);

  assert.deepEqual(list.rows, [goodRow]);
  const [notARow, missingCwd, numericSessionId, ...rest] = list.errors;
  assert.deepEqual(rest, []);
  assert.equal(notARow?.sessionId, undefined);
  assert.match(notARow?.message ?? "", /^row 0: Invalid input/);
  assert.equal(missingCwd?.sessionId, "fixture-two");
  assert.match(missingCwd?.message ?? "", /^cwd: Invalid input/);
  assert.equal(numericSessionId?.sessionId, "fixture-three");
});

void test("ends a child that ignores SIGTERM at the 5 second timeout", { timeout: 10_000 }, async (t) => {
  await stubClaude(t, "trap '' TERM\nexec sleep 30");

  const list = await createSessionListSource().read(0);

  assert.deepEqual(list.rows, []);
  assert.equal(list.errors.length, 1);
  assert.match(list.errors[0]?.message ?? "", /timed out/);
});

void test(
  "answers with the last list at once, refreshes at most every 3 seconds, and keeps the list when a call fails until a good call clears the error",
  { timeout: 10_000 },
  async (t) => {
    const stub = await stubClaude(t, printing([goodRow]));
    const sessions = createSessionListSource();
    assert.deepEqual(await sessions.read(0), { rows: [goodRow], errors: [] });
    await writeScript(stub, "echo 'example session text' >&2\nexit 3");

    await sessions.read(2999);
    await sleep(300);
    assert.deepEqual(
      await sessions.read(2999),
      { rows: [goodRow], errors: [] },
      "no call before 3 seconds have passed",
    );
    assert.deepEqual(
      await sessions.read(3000),
      { rows: [goodRow], errors: [] },
      "the refresh does not hold the request",
    );
    const failed = await readUntil(sessions, 3000, (list) => list.errors.length > 0);
    assert.deepEqual(
      failed,
      {
        rows: [goodRow],
        errors: [{ source: "claude agents", message: "claude agents --json --all exited with code 3" }],
      },
      "the error names the exit code and quotes none of stderr",
    );

    const renamed = { ...goodRow, name: "Renamed" };
    await writeScript(stub, printing([renamed]));
    const recovered = await readUntil(sessions, 6000, (list) => list.errors.length === 0);
    assert.deepEqual(recovered, { rows: [renamed], errors: [] });
  },
);

void test("a claude missing from PATH is an error saying so", async (t) => {
  const emptyDirectory = await makeDirectory(t);
  const originalPath = process.env["PATH"];
  process.env["PATH"] = emptyDirectory;
  t.after(() => {
    process.env["PATH"] = originalPath;
  });

  assert.deepEqual(await createSessionListSource().read(0), {
    rows: [],
    errors: [{ source: "claude agents", message: "claude was not found on PATH" }],
  });
});

void test("a claude ended by a signal is an error naming the signal", async (t) => {
  await stubClaude(t, "kill -TERM $$");

  assert.deepEqual(await createSessionListSource().read(0), {
    rows: [],
    errors: [{ source: "claude agents", message: "claude agents --json --all was ended by SIGTERM" }],
  });
});

void test("a clock set back counts as due, so the list still refreshes", async (t) => {
  const stub = await stubClaude(t, printing([goodRow]));
  const sessions = createSessionListSource();
  await sessions.read(5000);
  const renamed = { ...goodRow, name: "Renamed" };
  await writeScript(stub, printing([renamed]));

  const list = await readUntil(sessions, 1000, (read) => read.rows[0]?.name === "Renamed");

  assert.deepEqual(list.rows, [renamed]);
});

void test("starts no second call while one is running", async (t) => {
  const calls = join(await makeDirectory(t), "calls");
  await stubClaude(t, `echo call >> '${calls}'\nsleep 0.3\n${printing([goodRow])}`);
  const sessions = createSessionListSource();

  await Promise.all([sessions.read(0), sessions.read(5000)]);

  assert.equal(await readFile(calls, "utf8"), "call\n");
});

void test("runs claude from the home directory", async (t) => {
  await stubClaude(t, `printf '[{"cwd":"%s","kind":"interactive","startedAt":1}]' "$(pwd -P)"`);

  const list = await createSessionListSource().read(0);

  assert.deepEqual(
    list.rows.map((row) => row.cwd),
    [await realpath(homedir())],
  );
});

void test("output that is not a JSON list is an error, with no rows", async (t) => {
  const stub = await stubClaude(t, "echo 'not json'");
  assert.deepEqual(await createSessionListSource().read(0), {
    rows: [],
    errors: [{ source: "claude agents", message: "printed something other than JSON" }],
  });

  await writeScript(stub, `echo '{"sessions": []}'`);
  assert.deepEqual(await createSessionListSource().read(0), {
    rows: [],
    errors: [{ source: "claude agents", message: "printed JSON that is not a list" }],
  });
});
