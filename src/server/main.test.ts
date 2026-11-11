import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { start, type RunningHub } from "./main.ts";

type Reply = { status: number; headers: IncomingHttpHeaders; body: string };

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

async function startFixtureHub(t: TestContext): Promise<{ hub: RunningHub; root: string }> {
  const root = await makeAssetRoot(t);
  const hub = await start({ port: 0, assetRoot: root });
  t.after(() => hub.close());
  return { hub, root };
}

function send(port: number, path: string, options: { method?: string; headers?: Record<string, string> } = {}) {
  return new Promise<Reply>((resolve, reject) => {
    const outgoing = request({
      host: "127.0.0.1",
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

void test("a request whose Host is not exactly 127.0.0.1 and the hub's port is refused", async (t) => {
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
});

void test("/api/snapshot answers 401 without the launch token and the empty snapshot with it", async (t) => {
  const { hub } = await startFixtureHub(t);
  assert.equal((await send(hub.port, "/api/snapshot")).status, 401);
  const wrongToken = await send(hub.port, "/api/snapshot", { headers: { authorization: "Bearer not-the-token" } });
  assert.equal(wrongToken.status, 401);

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
  assert.deepEqual(snapshot.get("sessions"), []);
  assert.deepEqual(snapshot.get("errors"), []);
  const runId = snapshot.get("runId");
  assert.equal(typeof runId, "string");
  assert.equal(fieldsOf(JSON.parse(second.body)).get("runId"), runId, "runId holds for the run");
});

void test("every kind of response carries the CSP with the import map's hash and the other fixed headers", async (t) => {
  const { hub, root } = await startFixtureHub(t);
  const page = await send(hub.port, "/");
  const importMapHash = createHash("sha256").update(importMapOf(page.body)).digest("base64");
  const expectedCsp =
    `default-src 'none'; script-src 'self' 'sha256-${importMapHash}'; style-src 'self'; connect-src 'self'; ` +
    "img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
    "require-trusted-types-for 'script'; trusted-types 'none'";
  await rm(join(root, "src/web/icon.svg"));

  const cases: [string, number, Promise<Reply>][] = [
    ["page", 200, Promise.resolve(page)],
    ["asset", 200, send(hub.port, "/assets/styles.css")],
    ["snapshot", 200, send(hub.port, "/api/snapshot", { headers: { authorization: `Bearer ${hub.token}` } })],
    ["no token", 401, send(hub.port, "/api/snapshot")],
    ["unknown path", 404, send(hub.port, "/nothing-here")],
    ["post", 405, send(hub.port, "/", { method: "POST" })],
    ["wrong host", 421, send(hub.port, "/", { headers: { host: "localhost" } })],
    ["asset gone since startup", 500, send(hub.port, "/assets/icon.svg")],
  ];
  for (const [kind, status, pending] of cases) {
    const reply = await pending;
    assert.equal(reply.status, status, kind);
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
  const imports = fieldsOf(fieldsOf(JSON.parse(importMapOf(page.body))).get("imports"));
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
  await assert.rejects(start({ port: occupier.port, assetRoot }), { code: "EADDRINUSE" });
});

void test("the command line refuses to start when stdout is not a terminal", async () => {
  const mainPath = fileURLToPath(new URL("main.ts", import.meta.url));
  const free = await listenOnFreePort();
  free.server.close();
  await once(free.server, "close");
  const run = promisify(execFile)(process.execPath, [mainPath, "--port", String(free.port)]);
  await assert.rejects(run, (error: { code: number; stdout: string; stderr: string }) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, "", "no launch link is printed");
    assert.match(error.stderr, /stdout is not a terminal/);
    return true;
  });
});
