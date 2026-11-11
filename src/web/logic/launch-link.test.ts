import assert from "node:assert/strict";
import { test } from "node:test";
import { launchLink } from "../../shared/api.ts";
import { readLaunchHash } from "./launch-link.ts";

void test("the printed launch link opens the hub's origin with a hash that reads back as its token", () => {
  const token = "Ab09-_xYAb09-_xYAb09-_xYAb09-_xYAb09-_xYAb0";
  const link = new URL(launchLink(47821, token));
  assert.equal(link.origin, "http://127.0.0.1:47821");
  assert.deepEqual(readLaunchHash(link.hash), { kind: "token", token });
});

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
