import assert from "node:assert/strict";
import { test } from "node:test";
import { readRoute } from "./route.ts";

void test("the hash names the dashboard or the waiting list, and any other hash is unknown", () => {
  const hashes = ["", "#/", "#/waiting", "#t=abc", "#/session/fixture-one", "#/waiting/"];
  assert.deepEqual(hashes.map(readRoute), ["dashboard", "dashboard", "waiting", "unknown", "unknown", "unknown"]);
});
