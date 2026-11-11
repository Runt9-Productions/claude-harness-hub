import { launchHashPrefix } from "../../shared/api.ts";

export type LaunchHash = { kind: "absent" } | { kind: "token"; token: string } | { kind: "malformed" };

const base64url = /^[A-Za-z0-9_-]+$/;

export function readLaunchHash(hash: string): LaunchHash {
  if (!hash.startsWith(launchHashPrefix)) return { kind: "absent" };
  const token = hash.slice(launchHashPrefix.length);
  if (!base64url.test(token)) return { kind: "malformed" };
  return { kind: "token", token };
}
