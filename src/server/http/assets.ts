import { readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export type Asset = { file: string; contentType: string };

const contentTypes: ReadonlyMap<string, string> = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const browserBuildDir = join("dist", "browser");

const vendorFiles = [
  { specifier: "preact", file: join("node_modules", "preact", "dist", "preact.mjs"), url: "/vendor/preact.mjs" },
  {
    specifier: "preact/hooks",
    file: join("node_modules", "preact", "hooks", "dist", "hooks.mjs"),
    url: "/vendor/hooks.mjs",
  },
  {
    specifier: "preact/jsx-runtime",
    file: join("node_modules", "preact", "jsx-runtime", "dist", "jsxRuntime.mjs"),
    url: "/vendor/jsxRuntime.mjs",
  },
] as const;

export const stylesheetUrl = "/assets/styles.css";
export const iconUrl = "/assets/icon.svg";
export const pageScriptUrl = "/assets/web/ui/main.js";

/** Resolves the bare `preact` imports in the emitted browser code and in Preact's own files. */
export const importMap = {
  imports: Object.fromEntries(vendorFiles.map((vendor) => [vendor.specifier, vendor.url])),
};

function contentTypeOf(file: string): string {
  const contentType = contentTypes.get(extname(file));
  if (contentType === undefined) throw new Error(`no content type for asset ${file}`);
  return contentType;
}

function requireFile(file: string): string {
  if (!statSync(file).isFile()) throw new Error(`asset ${file} is not a file`);
  return file;
}

function browserBuildEntries(root: string): [string, string][] {
  const buildRoot = join(root, browserBuildDir);
  const files = readdirSync(buildRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  return files.map((file) => [`/assets/${relative(buildRoot, file).split(sep).join("/")}`, file]);
}

/**
 * Maps each served URL to its file, listed once from fixed locations under `root`. A request path is only ever looked
 * up here, never joined to a directory, so a file added after startup is not served until a restart. Throws when a
 * fixed file is missing or a file has no known content type.
 */
export function buildAssetTable(root: string): ReadonlyMap<string, Asset> {
  const entries: [string, string][] = [
    ...browserBuildEntries(root),
    [stylesheetUrl, join(root, "src", "web", "styles.css")],
    [iconUrl, join(root, "src", "web", "icon.svg")],
    ...vendorFiles.map((vendor): [string, string] => [vendor.url, join(root, vendor.file)]),
  ];
  const table = new Map<string, Asset>();
  for (const [url, file] of entries) {
    if (table.has(url)) throw new Error(`two assets claim ${url}`);
    table.set(url, { file: requireFile(file), contentType: contentTypeOf(file) });
  }
  return table;
}
