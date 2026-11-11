import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { launchLink, type Snapshot } from "../shared/api.ts";
import { buildAssetTable, iconUrl, importMap, pageScriptUrl, stylesheetUrl } from "./http/assets.ts";
import { createBrowserHandler, createClientErrorHandler } from "./http/browser.ts";

export type HubConfig = {
  /** 0 picks a free port. */
  port: number;
  /** The directory holding `dist/browser/`, `src/web/` and `node_modules/preact/`. */
  assetRoot: string;
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
  const snapshot = (): Snapshot => ({ runId, now: Date.now(), sessions: [], errors: [] });

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

async function runFromCommandLine(): Promise<void> {
  if (!process.stdout.isTTY) {
    console.error("hub: stdout is not a terminal, and the launch link is printed only to one; not starting");
    process.exitCode = 1;
    return;
  }
  const { values } = parseArgs({ options: { port: { type: "string" } } });
  const port = parsePort(values.port);
  const assetRoot = fileURLToPath(new URL("../../", import.meta.url));
  let hub: RunningHub;
  try {
    hub = await start({ port, assetRoot });
  } catch (error: unknown) {
    if (!isAddressInUse(error)) throw error;
    console.error(`hub: port ${port} is busy; not starting`);
    process.exitCode = 1;
    return;
  }
  console.log(launchLink(hub.port, hub.token));
}

if (import.meta.main) await runFromCommandLine();
