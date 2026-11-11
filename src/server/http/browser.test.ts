import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { connect, type Socket } from "node:net";
import { test, type TestContext } from "node:test";
import { createClientErrorHandler } from "./browser.ts";

const requestTimeoutMs = 200;

/** Sends bytes to a server with short timeouts and the client error handler, and never sends its own FIN. */
async function sendWithoutClosing(
  t: TestContext,
  bytes: string,
): Promise<{ statusLine: string; serverSocket: Socket }> {
  const server = createServer({
    headersTimeout: requestTimeoutMs,
    requestTimeout: requestTimeoutMs,
    connectionsCheckingInterval: requestTimeoutMs / 4,
  });
  server.on("clientError", createClientErrorHandler("{}"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(typeof address === "object" && address !== null);

  const accepted = new Promise<Socket>((resolve) => server.once("connection", resolve));
  const client = connect({ port: address.port, host: "127.0.0.1", allowHalfOpen: true });
  t.after(() => client.destroy());
  const serverSocket = await accepted;
  const chunks: Buffer[] = [];
  client.on("data", (chunk: Buffer) => chunks.push(chunk));
  client.write(bytes);
  await once(client, "end");
  const [statusLine = ""] = Buffer.concat(chunks).toString().split("\r\n");
  return { statusLine, serverSocket };
}

void test(
  "a client that stalls past the request timeout gets a 408 and loses its connection",
  { timeout: 5000 },
  async (t) => {
    const { statusLine, serverSocket } = await sendWithoutClosing(t, "GET / HTTP/1.1\r\n");
    assert.equal(statusLine, "HTTP/1.1 408 Request Timeout");
    if (!serverSocket.destroyed) await once(serverSocket, "close");
  },
);

void test("a chunk extension over Node's limit gets a 413", { timeout: 5000 }, async (t) => {
  const extension = "a".repeat(20_000);
  const request = `POST / HTTP/1.1\r\nHost: example.com\r\nTransfer-Encoding: chunked\r\n\r\n1;${extension}\r\nx\r\n0\r\n\r\n`;
  const { statusLine } = await sendWithoutClosing(t, request);
  assert.equal(statusLine, "HTTP/1.1 413 Payload Too Large");
});
