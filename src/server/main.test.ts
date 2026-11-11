import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import { connect } from "node:net";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { configDirFromEnvironment, start, type RunningHub } from "./main.ts";

type Reply = { status: number; headers: IncomingHttpHeaders; body: string };

const fixturesDir = fileURLToPath(new URL("../e2e/fixtures/", import.meta.url));
// The hub runs `claude agents` on every snapshot request, so the stub must answer instead of the real CLI.
process.env["PATH"] = `${join(fixturesDir, "bin")}${delimiter}${process.env["PATH"] ?? ""}`;

const javascript = "text/javascript; charset=utf-8";

const fixtureFiles = {
  "dist/browser/web/ui/main.js": "export const fixture = 'page script';\n",
  "src/web/styles.css": ":root { color-scheme: dark; }\n",
  "src/web/icon.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>\n',
  "node_modules/preact/dist/preact.mjs": "export const fixture = 'preact';\n",
  "node_modules/preact/hooks/dist/hooks.mjs": "export const fixture = 'hooks';\n",
  "node_modules/preact/jsx-runtime/dist/jsxRuntime.mjs": "export const fixture = 'jsx runtime';\n",
  "secret.txt": "not an asset\n",
} as const;

async function makeAssetRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hub-test-"));
  t.after(() => rm(root, { recursive: true }));
  for (const [file, text] of Object.entries(fixtureFiles)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
  }
  return root;
}

async function makeConfigDir(t: TestContext): Promise<string> {
  const configDir = await mkdtemp(join(tmpdir(), "hub-config-"));
  t.after(() => rm(configDir, { recursive: true }));
  return configDir;
}

async function startFixtureHub(t: TestContext, configDir?: string): Promise<{ hub: RunningHub; root: string }> {
  const root = await makeAssetRoot(t);
  const hub = await start({ port: 0, assetRoot: root, configDir: configDir ?? (await makeConfigDir(t)) });
  t.after(() => hub.close());
  return { hub, root };
}

type SendOptions = { method?: string; headers?: Record<string, string>; address?: string };

function send(port: number, path: string, options: SendOptions = {}) {
  return new Promise<Reply>((resolve, reject) => {
    const outgoing = request({
      host: options.address ?? "127.0.0.1",
      port,
      path,
      method: options.method ?? "GET",
      headers: options.headers,
    });
    outgoing.on("error", reject);
    outgoing.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString(),
        });
      });
    });
    outgoing.end();
  });
}

function headerField(line: string): [string, string] {
  const match = /^([^:]+): (.*)$/.exec(line);
  assert.ok(match?.[1] !== undefined && match[2] !== undefined, `a header line: ${line}`);
  return [match[1].toLowerCase(), match[2]];
}

/** Sends bytes as they are, which `send` cannot when Node's request parser is meant to reject them. */
async function sendRaw(port: number, bytes: string): Promise<Reply> {
  const socket = connect(port, "127.0.0.1");
  const chunks: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => chunks.push(chunk));
  socket.end(bytes);
  await once(socket, "close");
  const [head = "", body = ""] = Buffer.concat(chunks).toString().split("\r\n\r\n");
  const [statusLine = "", ...headerLines] = head.split("\r\n");
  const status = /^HTTP\/1\.1 (\d{3}) /.exec(statusLine)?.[1];
  assert.ok(status !== undefined, `a status line: ${statusLine}`);
  const headers = Object.fromEntries(headerLines.map(headerField));
  return { status: Number(status), headers, body };
}

function fieldsOf(value: unknown): Map<string, unknown> {
  assert.ok(typeof value === "object" && value !== null, "a JSON object");
  return new Map(Object.entries(value));
}

function importMapOf(page: string): string {
  const match = /<script type="importmap">(.*?)<\/script>/s.exec(page);
  assert.ok(match?.[1] !== undefined, "the page has an inline import map");
  return match[1];
}

async function listenOnFreePort(): Promise<{ server: Server; port: number }> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(typeof address === "object" && address !== null);
  return { server, port: address.port };
}

async function startAndClose(assetRoot: string, configDir: string): Promise<void> {
  const hub = await start({ port: 0, assetRoot, configDir });
  await hub.close();
}

void test("the hub listens on 127.0.0.1 only", async (t) => {
  const { hub } = await startFixtureHub(t);
  for (const address of ["127.0.0.2", "::1"]) {
    await assert.rejects(send(hub.port, "/", { address }), address);
  }
});

void test("a request whose Host is not exactly 127.0.0.1 and the hub's port is refused before its path or method is checked", async (t) => {
  const { hub } = await startFixtureHub(t);
  const wrongHosts = [
    `localhost:${hub.port}`,
    "127.0.0.1:1",
    "127.0.0.1",
    `127.0.0.1.:${hub.port}`,
    `[::1]:${hub.port}`,
  ];
  for (const host of wrongHosts) {
    const reply = await send(hub.port, "/", { headers: { host } });
    assert.equal(reply.status, 421, host);
  }
  const unknownPost = await send(hub.port, "/nothing-here", { method: "POST", headers: { host: "localhost" } });
  assert.equal(unknownPost.status, 421, "an unknown path with another method");
});

void test("/api/snapshot answers 401 without the launch token as a Bearer credential and the snapshot with it", async (t) => {
  const { hub } = await startFixtureHub(t);
  assert.equal((await send(hub.port, "/api/snapshot")).status, 401);
  const wrongToken = await send(hub.port, "/api/snapshot", { headers: { authorization: "Bearer not-the-token" } });
  assert.equal(wrongToken.status, 401);
  const noScheme = await send(hub.port, "/api/snapshot", { headers: { authorization: hub.token } });
  assert.equal(noScheme.status, 401, "the token without the Bearer scheme");

  const authorization = `Bearer ${hub.token}`;
  const before = Date.now();
  const first = await send(hub.port, "/api/snapshot", { headers: { authorization } });
  const second = await send(hub.port, "/api/snapshot", { headers: { authorization } });
  const after = Date.now();
  assert.equal(first.status, 200);
  assert.equal(first.headers["content-type"], "application/json");
  const snapshot = fieldsOf(JSON.parse(first.body));
  assert.deepEqual([...snapshot.keys()].toSorted(), ["errors", "now", "runId", "sessions"]);
  const now = snapshot.get("now");
  assert.ok(typeof now === "number" && now >= before && now <= after, "now is the current time in milliseconds");
  const runId = snapshot.get("runId");
  assert.equal(typeof runId, "string");
  assert.equal(fieldsOf(JSON.parse(second.body)).get("runId"), runId, "runId holds for the run");
});

void test("each snapshot request reads the session list and the stores under the config dir", async (t) => {
  const configDir = await makeConfigDir(t);
  await cp(join(fixturesDir, ".claude"), configDir, { recursive: true });
  const { hub } = await startFixtureHub(t, configDir);
  const authorization = `Bearer ${hub.token}`;
  async function readSessions(): Promise<Map<string, unknown>> {
    const reply = await send(hub.port, "/api/snapshot", { headers: { authorization } });
    const snapshot = fieldsOf(JSON.parse(reply.body));
    assert.deepEqual(snapshot.get("errors"), []);
    const sessions = snapshot.get("sessions");
    assert.ok(Array.isArray(sessions));
    return new Map(sessions.map((session) => [String(fieldsOf(session).get("key")), session]));
  }

  const sessions = await readSessions();
  assert.deepEqual(
    [...sessions.keys()],
    ["fixture-session-alpha", "fixture-session-beta", "fixture-session-gamma", "fixture-session-delta"],
  );
  assert.deepEqual(sessions.get("fixture-session-alpha"), {
    key: "fixture-session-alpha",
    sessionId: "fixture-session-alpha",
    name: "Tidy the parser",
    cwd: "/srv/example/alpha",
    kind: "interactive",
    startedAt: 1794300000000,
    isProcessAlive: true,
    status: "busy",
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
    needsYou: true,
    waitingCount: 2,
    hasUnreadAnswers: true,
    canAnswer: false,
    canSetMode: false,
  });
  const gamma = fieldsOf(sessions.get("fixture-session-gamma"));
  assert.equal(gamma.get("mode"), "distracted");
  assert.equal(gamma.get("shortId"), "fixgamma");
  assert.deepEqual(gamma.get("ownerTasks"), [
    {
      id: "O1",
      rev: 0,
      title: "Check the report reads well",
      items: [{ label: "Read the summary", isTicked: true }],
      isStartPressed: true,
      isDone: true,
      lastChange: { summary: 'ticked "Read the summary"', delivery: "seen" },
    },
  ]);
  assert.equal(fieldsOf(sessions.get("fixture-session-delta")).get("isProcessAlive"), false);

  const awayFile = join(configDir, "plugins/store/away_fixture-market.json");
  await writeFile(awayFile, JSON.stringify({ "session:fixture-session-beta": "distracted" }));
  const reread = await readSessions();
  assert.equal(fieldsOf(reread.get("fixture-session-beta")).get("mode"), "distracted");
  assert.equal(fieldsOf(reread.get("fixture-session-gamma")).get("mode"), undefined);
});

void test("each start makes its own 32-byte launch token and runId", async (t) => {
  const hubs = [(await startFixtureHub(t)).hub, (await startFixtureHub(t)).hub];
  assert.equal(Buffer.from(hubs[0]?.token ?? "", "base64url").length, 32);
  assert.notEqual(hubs[0]?.token, hubs[1]?.token);
  const runIds = [];
  for (const hub of hubs) {
    const reply = await send(hub.port, "/api/snapshot", { headers: { authorization: `Bearer ${hub.token}` } });
    runIds.push(fieldsOf(JSON.parse(reply.body)).get("runId"));
  }
  assert.notEqual(runIds[0], runIds[1]);
});

void test("every kind of response carries its status and own headers, and the CSP with the import map's hash and the other fixed headers", async (t) => {
  const { hub, root } = await startFixtureHub(t);
  const page = await send(hub.port, "/");
  const importMapHash = createHash("sha256").update(importMapOf(page.body)).digest("base64");
  const expectedCsp =
    `default-src 'none'; script-src 'self' 'sha256-${importMapHash}'; style-src 'self'; connect-src 'self'; ` +
    "img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
    "require-trusted-types-for 'script'; trusted-types 'none'";
  await rm(join(root, "src/web/icon.svg"));
  // Over Node's default 16 KiB header limit.
  const oversizedHeaders = `GET / HTTP/1.1\r\nHost: 127.0.0.1:${hub.port}\r\nX-Padding: ${"a".repeat(20_000)}\r\n\r\n`;

  const cases: [string, number, Record<string, string>, Promise<Reply>][] = [
    ["page", 200, {}, Promise.resolve(page)],
    ["asset", 200, {}, send(hub.port, "/assets/styles.css")],
    ["snapshot", 200, {}, send(hub.port, "/api/snapshot", { headers: { authorization: `Bearer ${hub.token}` } })],
    ["no token", 401, { "www-authenticate": "Bearer" }, send(hub.port, "/api/snapshot")],
    ["unknown path", 404, {}, send(hub.port, "/nothing-here")],
    ["post", 405, { allow: "GET" }, send(hub.port, "/", { method: "POST" })],
    ["wrong host", 421, {}, send(hub.port, "/", { headers: { host: "localhost" } })],
    ["asset gone since startup", 500, {}, send(hub.port, "/assets/icon.svg")],
    ["unparseable request", 400, { connection: "close" }, sendRaw(hub.port, "BOGUS\r\n\r\n")],
    ["oversized headers", 431, { connection: "close" }, sendRaw(hub.port, oversizedHeaders)],
    ["no host", 421, {}, sendRaw(hub.port, "GET / HTTP/1.1\r\nConnection: close\r\n\r\n")],
    [
      "unknown expectation",
      421,
      {},
      sendRaw(hub.port, "GET / HTTP/1.1\r\nHost: localhost\r\nExpect: example\r\nConnection: close\r\n\r\n"),
    ],
  ];
  for (const [kind, status, ownHeaders, pending] of cases) {
    const reply = await pending;
    assert.equal(reply.status, status, kind);
    for (const [name, value] of Object.entries(ownHeaders)) {
      assert.equal(reply.headers[name], value, `${kind} ${name}`);
    }
    assert.equal(reply.headers["content-security-policy"], expectedCsp, kind);
    assert.equal(reply.headers["x-content-type-options"], "nosniff", kind);
    assert.equal(reply.headers["referrer-policy"], "no-referrer", kind);
    assert.equal(reply.headers["cache-control"], "no-store", kind);
    const corsHeaders = Object.keys(reply.headers).filter((name) => name.startsWith("access-control-"));
    assert.deepEqual(corsHeaders, [], kind);
  }
});

void test("only the listed asset URLs are served, from their files as they are now", async (t) => {
  const { hub, root } = await startFixtureHub(t);
  const page = await send(hub.port, "/");
  const importMap = fieldsOf(JSON.parse(importMapOf(page.body)));
  const imports = fieldsOf(importMap.get("imports"));
  const served: [string, string, string][] = [
    ["/assets/web/ui/main.js", javascript, fixtureFiles["dist/browser/web/ui/main.js"]],
    ["/assets/styles.css", "text/css; charset=utf-8", fixtureFiles["src/web/styles.css"]],
    ["/assets/icon.svg", "image/svg+xml", fixtureFiles["src/web/icon.svg"]],
  ];
  const vendored = [
    ["preact", "node_modules/preact/dist/preact.mjs"],
    ["preact/hooks", "node_modules/preact/hooks/dist/hooks.mjs"],
    ["preact/jsx-runtime", "node_modules/preact/jsx-runtime/dist/jsxRuntime.mjs"],
  ] as const;
  for (const [specifier, file] of vendored) {
    const url = imports.get(specifier);
    assert.ok(typeof url === "string", `the import map resolves ${specifier}`);
    served.push([url, javascript, fixtureFiles[file]]);
  }
  for (const [url, contentType, body] of served) {
    const reply = await send(hub.port, url);
    assert.equal(reply.status, 200, url);
    assert.equal(reply.headers["content-type"], contentType, url);
    assert.equal(reply.body, body, url);
  }

  await writeFile(join(root, "dist/browser/web/ui/main.js"), "export const fixture = 'rebuilt';\n");
  assert.equal((await send(hub.port, "/assets/web/ui/main.js")).body, "export const fixture = 'rebuilt';\n");

  await writeFile(join(root, "dist/browser/web/ui/added.js"), "export {};\n");
  const unlisted = ["/secret.txt", "/assets/../secret.txt", "/src/web/styles.css", "/assets/web/ui/added.js"];
  for (const path of unlisted) {
    assert.equal((await send(hub.port, path)).status, 404, path);
  }
});

void test("start rejects when the port is already taken", async (t) => {
  const assetRoot = await makeAssetRoot(t);
  const occupier = await listenOnFreePort();
  t.after(() => occupier.server.close());
  const configDir = await makeConfigDir(t);
  await assert.rejects(start({ port: occupier.port, assetRoot, configDir }), { code: "EADDRINUSE" });
});

void test("start rejects an asset root missing a fixed file or holding a file with no content type", async (t) => {
  const configDir = await makeConfigDir(t);
  const missing = await makeAssetRoot(t);
  await rm(join(missing, "src/web/icon.svg"));
  await assert.rejects(startAndClose(missing, configDir), /icon\.svg/);
  const untyped = await makeAssetRoot(t);
  await writeFile(join(untyped, "dist/browser/web/ui/main.js.map"), "{}\n");
  await assert.rejects(startAndClose(untyped, configDir), /no content type for asset .*main\.js\.map/);
});

void test("the command line refuses to start when stdout is not a terminal", async () => {
  const mainPath = fileURLToPath(new URL("main.ts", import.meta.url));
  const free = await listenOnFreePort();
  free.server.close();
  await once(free.server, "close");
  // The timeout kills a hub that starts anyway, which fails the exit code check instead of hanging the test.
  const run = promisify(execFile)(process.execPath, [mainPath, "--port", String(free.port)], { timeout: 5000 });
  await assert.rejects(run, (error: { code: number; stdout: string; stderr: string }) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, "", "no launch link is printed");
    assert.match(error.stderr, /stdout is not a terminal/);
    return true;
  });
});

void test("the command line refuses a bad --port with a one-line reason", async () => {
  const mainPath = fileURLToPath(new URL("main.ts", import.meta.url));
  const run = promisify(execFile)(process.execPath, [mainPath, "--port", "70000"], { timeout: 5000 });
  await assert.rejects(run, (error: { code: number; stderr: string }) => {
    assert.equal(error.code, 1);
    assert.equal(error.stderr, "hub: --port 70000 is not a port number from 1 to 65535; not starting\n");
    return true;
  });
});

void test("the config dir is $CLAUDE_CONFIG_DIR, else ~/.claude, and a relative or empty one is refused", () => {
  assert.equal(configDirFromEnvironment({}), join(homedir(), ".claude"));
  assert.equal(configDirFromEnvironment({ CLAUDE_CONFIG_DIR: "/srv/example/config" }), "/srv/example/config");
  for (const configured of ["example/config", ""]) {
    assert.throws(() => configDirFromEnvironment({ CLAUDE_CONFIG_DIR: configured }), /not an absolute path/);
  }
});
