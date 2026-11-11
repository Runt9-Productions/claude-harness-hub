import assert from "node:assert/strict";
import { test } from "node:test";
import { readLaunchHash } from "./launch-link.ts";

void test("takes a base64url token from #t= and nothing from any other hash", () => {
  assert.deepEqual(readLaunchHash("#t=Ab09-_xY"), { kind: "token", token: "Ab09-_xY" });
  assert.deepEqual(readLaunchHash(""), { kind: "absent" });
  assert.deepEqual(readLaunchHash("#/"), { kind: "absent" });
  assert.deepEqual(readLaunchHash("#/t=Ab09"), { kind: "absent" });
});

void test("a #t= hash with an empty or non-base64url token is malformed", () => {
  assert.deepEqual(readLaunchHash("#t="), { kind: "malformed" });
  assert.deepEqual(readLaunchHash("#t=Ab%0A09"), { kind: "malformed" });
  assert.deepEqual(readLaunchHash("#t=Ab09&x=1"), { kind: "malformed" });
  assert.deepEqual(readLaunchHash("#t=Ab+/09="), { kind: "malformed" });
});
