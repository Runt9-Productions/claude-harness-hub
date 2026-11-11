import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { start } from "../server/main.ts";

const configVariables = ["HOME", "CLAUDE_CONFIG_DIR"] as const;

function isUnderTemporaryDirectory(path: string | undefined): boolean {
  if (path === undefined) return false;
  return resolve(path).startsWith(resolve(tmpdir()) + sep);
}

// Run any other way, the hub would read the owner's real config dir and print real board text.
for (const name of configVariables) {
  if (!isUnderTemporaryDirectory(process.env[name])) {
    throw new Error(
      `${name} is not under the temporary directory; start the fixture hub with scripts/start-fixture-hub.sh`,
    );
  }
}

const assetRoot = fileURLToPath(new URL("../../", import.meta.url));
const hub = await start({ port: 0, assetRoot });
console.log(`http://127.0.0.1:${hub.port}/#t=${hub.token}`);
