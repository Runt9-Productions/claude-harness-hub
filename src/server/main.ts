import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { launchLink, type Snapshot } from "../shared/api.ts";
import { buildAssetTable, iconUrl, importMap, pageScriptUrl, stylesheetUrl } from "./http/assets.ts";
import { createBrowserHandler, createClientErrorHandler } from "./http/browser.ts";
import { buildSnapshot } from "./hub/snapshot.ts";
import { createSessionListSource } from "./sources/agents.ts";
import { createStoreSource } from "./sources/stores.ts";

export type HubConfig = {
  /** 0 picks a free port. */
  port: number;
  /** The directory holding `dist/browser/`, `src/web/` and `node_modules/preact/`. */
  assetRoot: string;
  /** Where the `board` and `away` stores live, under `plugins/store/`. */
  configDir: string;
};

export type RunningHub = { port: number; token: string; close: () => Promise<void> };

const defaultPort = 47821;
const tokenBytes = 32;

function pageHtml(importMapText: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Claude harness hub</title>
    <link rel="icon" href="${iconUrl}" type="image/svg+xml">
    <link rel="stylesheet" href="${stylesheetUrl}">
    <script type="importmap">${importMapText}</script>
    <script type="module" src="${pageScriptUrl}"></script>
  </head>
  <body></body>
</html>
`;
}

/** Rejects with the listen error, `EADDRINUSE` included, when the port cannot be bound. */
export async function start(config: HubConfig): Promise<RunningHub> {
  const token = randomBytes(tokenBytes).toString("base64url");
  const runId = randomUUID();
  const assets = buildAssetTable(config.assetRoot);
  const importMapText = JSON.stringify(importMap);
  const page = pageHtml(importMapText);
  const sessionList = createSessionListSource();
  const stores = createStoreSource(config.configDir);

  async function snapshot(): Promise<Snapshot> {
    const now = Date.now();
    const list = await sessionList.read(now);
    const sessionIds: string[] = [];
    for (const row of list.rows) {
      if (row.sessionId !== undefined) sessionIds.push(row.sessionId);
    }
    const stored = await stores.read(sessionIds, now);
    return buildSnapshot({ runId, now, list, stores: stored });
  }

  // Node answers a missing Host itself, without the fixed headers, unless told not to; the handler's Host check refuses it.
  const server = createServer({ requireHostHeader: false });
  server.on("clientError", createClientErrorHandler(importMapText));
  server.listen(config.port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error(`unexpected server address ${address}`);
  // Attached after listening because the Host check needs the bound port; this runs before any connection is read.
  const handleBrowserRequest = createBrowserHandler({
    port: address.port,
    token,
    page,
    importMap: importMapText,
    assets,
    snapshot,
  });
  server.on("request", handleBrowserRequest);
  // Without a listener Node answers an `Expect` other than `100-continue` with its own 417.
  server.on("checkExpectation", handleBrowserRequest);

  async function close(): Promise<void> {
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  }

  return { port: address.port, token, close };
}

function parsePort(text: string | undefined): number {
  if (text === undefined) return defaultPort;
  const port = Number(text);
  const isPortNumber = /^[0-9]+$/.test(text) && port >= 1 && port <= 65535;
  if (!isPortNumber) throw new Error(`--port ${text} is not a port number from 1 to 65535`);
  return port;
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

/** `$CLAUDE_CONFIG_DIR`, else `~/.claude`; throws when `$CLAUDE_CONFIG_DIR` is set but not an absolute path. */
export function configDirFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const configured = environment["CLAUDE_CONFIG_DIR"];
  if (configured === undefined) return join(homedir(), ".claude");
  if (!isAbsolute(configured)) throw new Error("CLAUDE_CONFIG_DIR is not an absolute path");
  return configured;
}

function refuseToStart(reason: string): void {
  console.error(`hub: ${reason}; not starting`);
  process.exitCode = 1;
}

async function runFromCommandLine(): Promise<void> {
  const { values } = parseArgs({ options: { port: { type: "string" } } });
  let port: number;
  let configDir: string;
  try {
    port = parsePort(values.port);
    configDir = configDirFromEnvironment(process.env);
  } catch (error: unknown) {
    if (!(error instanceof Error)) throw error;
    refuseToStart(error.message);
    return;
  }
  if (!process.stdout.isTTY) {
    refuseToStart("stdout is not a terminal, and the launch link is printed only to one");
    return;
  }
  const assetRoot = fileURLToPath(new URL("../../", import.meta.url));
  let hub: RunningHub;
  try {
    hub = await start({ port, assetRoot, configDir });
  } catch (error: unknown) {
    if (!isAddressInUse(error)) throw error;
    refuseToStart(`port ${port} is busy`);
    return;
  }
  console.log(launchLink(hub.port, hub.token));
}

if (import.meta.main) await runFromCommandLine();
