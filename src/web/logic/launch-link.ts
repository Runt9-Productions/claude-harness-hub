export type LaunchHash = { kind: "absent" } | { kind: "token"; token: string } | { kind: "malformed" };

const tokenPrefix = "#t=";
const base64url = /^[A-Za-z0-9_-]+$/;

export function readLaunchHash(hash: string): LaunchHash {
  if (!hash.startsWith(tokenPrefix)) return { kind: "absent" };
  const token = hash.slice(tokenPrefix.length);
  if (!base64url.test(token)) return { kind: "malformed" };
  return { kind: "token", token };
}
