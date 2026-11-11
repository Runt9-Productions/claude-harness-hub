import type { Stats } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import type { SourceError } from "../../shared/api.ts";

const boardFileName = /^board_.+\.json$/;
const awayFileName = /^away_.+\.json$/;
const parseGraceMilliseconds = 10_000;

type StoreKind = "board" | "away";

const deliverySchema = z.enum(["sending", "sent", "seen", "failed"]);

const itemSchema = z.object({ label: z.string(), isTicked: z.boolean() });

const optionSchema = z.union([
  z.string().transform((label) => ({ label })),
  z.object({ label: z.string(), description: z.string().exactOptional() }),
]);

// The defaults are the board plugin's own reading of an absent field; `rev` is the hub contract's.
const decisionSchema = z.object({
  id: z.string(),
  rev: z.number().default(0),
  createdAt: z.number().exactOptional(),
  question: z.string(),
  context: z.string().exactOptional(),
  options: z.array(optionSchema),
  recommended: z.number().exactOptional(),
  agentId: z.string().exactOptional(),
  askedBy: z.string().exactOptional(),
  plugin: z.string().exactOptional(),
  isAnswerKept: z.boolean().default(false),
  answer: z.string().exactOptional(),
  chosenOption: z.string().exactOptional(),
  note: z.string().exactOptional(),
  delivery: deliverySchema.exactOptional(),
});

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["pending", "in_progress", "blocked", "done"]),
  note: z.string().exactOptional(),
  holderId: z.string().exactOptional(),
  items: z.array(itemSchema).default([]),
});

const ownerTaskSchema = z.object({
  id: z.string(),
  rev: z.number().default(0),
  createdAt: z.number().exactOptional(),
  title: z.string(),
  description: z.string().exactOptional(),
  items: z.array(itemSchema),
  isStartPressed: z.boolean().default(false),
  isDone: z.boolean(),
  agentId: z.string().exactOptional(),
  postedBy: z.string().exactOptional(),
  lastChange: z.object({ summary: z.string(), delivery: deliverySchema }).exactOptional(),
});

const boardEntrySchema = z.object({
  savedAt: z.number().exactOptional(),
  decisions: z.array(decisionSchema).default([]),
  tasks: z.array(taskSchema).default([]),
  ownerTasks: z.array(ownerTaskSchema).default([]),
});

// `present` is never saved, since the away plugin deletes the key instead, but it is a mode the plugin reads back.
const modeSchema = z.enum(["present", "distracted", "away"]);

/** One session's saved board, with bare-string options normalized and absent fields read as the board plugin reads them. */
export type BoardEntry = z.output<typeof boardEntrySchema>;

export type Mode = z.output<typeof modeSchema>;

/** What the stores hold for one session; a field is absent when no file holds it or its entry failed validation. */
export type SessionStores = { board?: BoardEntry; mode?: Mode };

export type StoreRead = { sessions: Map<string, SessionStores>; errors: SourceError[] };

export type StoreSource = { read: (sessionIds: readonly string[], now: number) => Promise<StoreRead> };

type StoreFile = {
  kind: StoreKind;
  modifiedAt: number;
  size: number;
  content?: Record<string, unknown>;
  failingSince?: number;
};

type Listing = { names: string[]; error?: SourceError };

function sourceName(kind: StoreKind): string {
  return `${kind} store`;
}

function storeKind(name: string): StoreKind | undefined {
  if (boardFileName.test(name)) return "board";
  if (awayFileName.test(name)) return "away";
  return undefined;
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function errorCode(error: unknown): string {
  if (error instanceof Error && "code" in error) return String(error.code);
  return "an unknown error";
}

async function listStoreFiles(directory: string): Promise<Listing> {
  try {
    const names = await readdir(directory);
    return { names: names.toSorted() };
  } catch (error: unknown) {
    // No plugin has saved anything yet.
    if (isErrorCode(error, "ENOENT")) return { names: [] };
    return {
      names: [],
      error: { source: "stores", message: `could not list the store directory: ${errorCode(error)}` },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseStoreFile(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    // Writes are not known to be atomic, so a half-written file is retried before it counts as an error.
    return undefined;
  }
}

function issueMessage(issues: readonly z.core.$ZodIssue[]): string {
  const details = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return details.join("; ");
}

function savedAtRank(entry: unknown): number {
  if (!isRecord(entry)) return 0;
  const savedAt = entry["savedAt"];
  // The board plugin's own pruning ranks an entry without `savedAt` as 0.
  return typeof savedAt === "number" ? savedAt : 0;
}

/** The file holding `key` with the highest rank; the first in name order on a tie. */
function newestHolder(
  files: readonly StoreFile[],
  key: string,
  rank: (file: StoreFile) => number,
): StoreFile | undefined {
  let newest: StoreFile | undefined;
  for (const file of files) {
    if (file.content === undefined || !Object.hasOwn(file.content, key)) continue;
    if (newest !== undefined && rank(file) <= rank(newest)) continue;
    newest = file;
  }
  return newest;
}

async function statStoreFile(path: string, kind: StoreKind, errors: SourceError[]): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error: unknown) {
    // Deleted between the listing and the stat.
    if (isErrorCode(error, "ENOENT")) return undefined;
    errors.push({ source: sourceName(kind), message: `${basename(path)} could not be read: ${errorCode(error)}` });
    return undefined;
  }
}

/**
 * Reads the board and away stores under `<configDir>/plugins/store/`. A file is parsed again only when its modified
 * time or size changed, or its last parse failed. A file that fails keeps its last good copy and is reported only once
 * it has failed for 10 seconds of `now`. Only listed sessions' entries are validated, so an unlisted session's old
 * shape raises nothing.
 */
export function createStoreSource(configDir: string): StoreSource {
  const directory = join(configDir, "plugins", "store");
  const filesByPath = new Map<string, StoreFile>();

  async function refreshFile(path: string, kind: StoreKind, stats: Stats, now: number): Promise<StoreFile> {
    const cached = filesByPath.get(path);
    const isUnchanged = cached?.modifiedAt === stats.mtimeMs && cached.size === stats.size;
    if (isUnchanged && cached.failingSince === undefined) return cached;
    const file: StoreFile = { kind, modifiedAt: stats.mtimeMs, size: stats.size };
    const content = await parseStoreFile(path);
    if (content !== undefined) return { ...file, content };
    const failing = { ...file, failingSince: cached?.failingSince ?? now };
    const lastGood = cached?.content;
    return lastGood === undefined ? failing : { ...failing, content: lastGood };
  }

  async function readFiles(now: number): Promise<SourceError[]> {
    const listing = await listStoreFiles(directory);
    const errors: SourceError[] = listing.error === undefined ? [] : [listing.error];
    const seen = new Set<string>();
    for (const name of listing.names) {
      const kind = storeKind(name);
      if (kind === undefined) continue;
      const path = join(directory, name);
      // A name from readdir has no separator, but a path outside the root must never be read.
      if (dirname(path) !== directory) continue;
      const stats = await statStoreFile(path, kind, errors);
      if (stats === undefined) continue;
      if (!stats.isFile()) {
        errors.push({ source: sourceName(kind), message: `${name} is not a regular file` });
        continue;
      }
      seen.add(path);
      const file = await refreshFile(path, kind, stats, now);
      filesByPath.set(path, file);
      const hasFailedTooLong = file.failingSince !== undefined && now - file.failingSince >= parseGraceMilliseconds;
      const message = `${name} has not read as a JSON object for ${parseGraceMilliseconds} ms`;
      if (hasFailedTooLong) errors.push({ source: sourceName(kind), message });
    }
    for (const path of filesByPath.keys()) {
      if (!seen.has(path)) filesByPath.delete(path);
    }
    return errors;
  }

  function lookUp(sessionId: string, errors: SourceError[]): SessionStores {
    const key = `session:${sessionId}`;
    const all = [...filesByPath.values()];
    const stores: SessionStores = {};
    const boardFiles = all.filter((file) => file.kind === "board");
    const boardFile = newestHolder(boardFiles, key, (file) => savedAtRank(file.content?.[key]));
    if (boardFile !== undefined) {
      const result = boardEntrySchema.safeParse(boardFile.content?.[key]);
      if (result.success) stores.board = result.data;
      else errors.push({ source: sourceName("board"), sessionId, message: issueMessage(result.error.issues) });
    }
    const awayFiles = all.filter((file) => file.kind === "away");
    const awayFile = newestHolder(awayFiles, key, (file) => file.modifiedAt);
    if (awayFile !== undefined) {
      const result = modeSchema.safeParse(awayFile.content?.[key]);
      if (result.success) stores.mode = result.data;
      else
        errors.push({ source: sourceName("away"), sessionId, message: `mode: ${issueMessage(result.error.issues)}` });
    }
    return stores;
  }

  async function read(sessionIds: readonly string[], now: number): Promise<StoreRead> {
    const errors = await readFiles(now);
    const sessions = new Map<string, SessionStores>();
    for (const sessionId of sessionIds) sessions.set(sessionId, lookUp(sessionId, errors));
    return { sessions, errors };
  }

  return { read };
}
