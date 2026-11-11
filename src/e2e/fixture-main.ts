import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { start } from "../server/main.ts";
import { launchLink } from "../shared/api.ts";

function isUnderTemporaryDirectory(path: string): boolean {
  const temporaryRoot = resolve(tmpdir());
  return resolve(path).startsWith(temporaryRoot + sep);
}

// Run any other way, the hub would read the owner's real config dir and print real board text.
function temporaryPath(name: "HOME" | "CLAUDE_CONFIG_DIR"): string {
  const path = process.env[name];
  if (path === undefined || !isUnderTemporaryDirectory(path)) {
    throw new Error(
      `${name} is not under the temporary directory; start the fixture hub with scripts/start-fixture-hub.sh`,
    );
  }
  return path;
}

temporaryPath("HOME");
const configDir = temporaryPath("CLAUDE_CONFIG_DIR");
const assetRoot = fileURLToPath(new URL("../../", import.meta.url));
const hub = await start({ port: 0, assetRoot, configDir });
console.log(launchLink(hub.port, hub.token));
