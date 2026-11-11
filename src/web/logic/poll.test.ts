import assert from "node:assert/strict";
import { test } from "node:test";
import { pollInterval } from "./poll.ts";

void test("polls every 2 seconds while the page is visible and every 30 while it is hidden", () => {
  assert.equal(pollInterval(false), 2000);
  assert.equal(pollInterval(true), 30_000);
});
