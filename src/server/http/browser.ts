import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
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
  const commonHeaders = {
    "Content-Security-Policy": contentSecurityPolicy(config.importMap),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };

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
    return timingSafeEqual(sha256(authorization.slice("Bearer ".length)), tokenHash);
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
