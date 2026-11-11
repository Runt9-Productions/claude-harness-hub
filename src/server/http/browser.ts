import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { STATUS_CODES, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { apiPrefix, snapshotPath, type Snapshot } from "../../shared/api.ts";
import type { Asset } from "./assets.ts";

export type BrowserHandlerConfig = {
  port: number;
  token: string;
  page: string;
  /** The inline import map's exact text, whose hash `script-src` allows. */
  importMap: string;
  assets: ReadonlyMap<string, Asset>;
  snapshot: () => Snapshot;
};

type Route = { kind: "page" } | { kind: "snapshot" } | { kind: "asset"; asset: Asset };

type Reply = { status: number; contentType: string; body: string | Buffer; headers?: Record<string, string> };

function sha256(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

export function contentSecurityPolicy(importMap: string): string {
  const importMapHash = sha256(importMap).toString("base64");
  return [
    "default-src 'none'",
    `script-src 'self' 'sha256-${importMapHash}'`,
    "style-src 'self'",
    "connect-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join("; ");
}

function fixedHeaders(importMap: string): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(importMap),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };
}

/** The statuses Node itself would answer with. */
function clientErrorStatus(error: Error): number {
  if (!("code" in error)) return 400;
  if (error.code === "HPE_HEADER_OVERFLOW") return 431;
  if (error.code === "ERR_HTTP_REQUEST_TIMEOUT") return 408;
  return 400;
}

/**
 * Answers a request Node cannot parse, such as a bad request line or oversized headers, with the fixed headers that
 * Node's own reply lacks. There is no response object, so the reply is written to the socket raw.
 */
export function createClientErrorHandler(importMap: string): (error: Error, socket: Duplex) => void {
  const headers = { ...fixedHeaders(importMap), "Content-Length": "0", Connection: "close" };
  const headerLines = Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`);

  return function handleClientError(error: Error, socket: Duplex): void {
    if (!socket.writable) {
      socket.destroy();
      return;
    }
    const status = clientErrorStatus(error);
    const statusLine = `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ""}\r\n`;
    socket.end(`${statusLine}${headerLines.join("")}\r\n`);
  };
}

function plain(status: number, text: string, headers: Record<string, string> = {}): Reply {
  return { status, contentType: "text/plain; charset=utf-8", body: text, headers };
}

/** The raw path, unnormalised, so only a URL spelled exactly as a route matches it. */
function requestPath(url: string): string {
  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

/** Answers every request: exact `Host`, then the route, then the token for `/api/*`. */
export function createBrowserHandler(config: BrowserHandlerConfig) {
  const expectedHost = `127.0.0.1:${config.port}`;
  const tokenHash = sha256(config.token);
  const commonHeaders = fixedHeaders(config.importMap);

  function findRoute(path: string): Route | undefined {
    if (path === "/") return { kind: "page" };
    if (path === snapshotPath) return { kind: "snapshot" };
    const asset = config.assets.get(path);
    return asset === undefined ? undefined : { kind: "asset", asset };
  }

  // Both sides are hashed first because timingSafeEqual throws on buffers of unequal length.
  function hasToken(request: IncomingMessage): boolean {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ") !== true) return false;
    const presented = authorization.slice("Bearer ".length);
    return timingSafeEqual(sha256(presented), tokenHash);
  }

  async function reply(request: IncomingMessage): Promise<Reply> {
    if (request.headers.host !== expectedHost) return plain(421, "Unknown host");
    const path = requestPath(request.url ?? "");
    const route = findRoute(path);
    if (route === undefined) return plain(404, "Not found");
    if (request.method !== "GET") return plain(405, "Method not allowed", { Allow: "GET" });
    if (path.startsWith(apiPrefix) && !hasToken(request)) {
      return plain(401, "Missing or wrong token", { "WWW-Authenticate": "Bearer" });
    }
    if (route.kind === "page") return { status: 200, contentType: "text/html; charset=utf-8", body: config.page };
    if (route.kind === "snapshot") {
      return { status: 200, contentType: "application/json", body: JSON.stringify(config.snapshot()) };
    }
    return { status: 200, contentType: route.asset.contentType, body: await readFile(route.asset.file) };
  }

  return async function handleBrowserRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let answer: Reply;
    try {
      answer = await reply(request);
    } catch (error: unknown) {
      console.error(`hub: ${request.method ?? "?"} request failed:`, error);
      answer = plain(500, "Internal error");
    }
    response.writeHead(answer.status, { ...commonHeaders, ...answer.headers, "Content-Type": answer.contentType });
    response.end(answer.body);
  };
}
