import { execFile, type ExecFileException } from "node:child_process";
import { homedir } from "node:os";
import { delimiter } from "node:path";
import { z } from "zod";
import type { SourceError } from "../../shared/api.ts";

const source = "claude agents";
const commandArguments = ["agents", "--json", "--all"] as const;
const timeoutMilliseconds = 5000;
const refreshIntervalMilliseconds = 3000;

type CheckedField = "kind" | "status" | "state" | "waitingFor";

const knownValues: readonly (readonly [CheckedField, readonly string[]])[] = [
  ["kind", ["interactive", "background"]],
  ["status", ["busy", "waiting", "idle"]],
  ["state", ["working", "blocked", "done", "failed", "stopped"]],
  ["waitingFor", ["permission prompt", "input needed", "sandbox request", "worker request", "dialog open"]],
];

// Only the first three are on every row: a stopped background row has no `status`, and `sessionId` is set only sometimes.
const rowSchema = z.object({
  cwd: z.string(),
  kind: z.string(),
  startedAt: z.number(),
  id: z.string().exactOptional(),
  sessionId: z.string().exactOptional(),
  name: z.string().exactOptional(),
  pid: z.number().exactOptional(),
  status: z.string().exactOptional(),
  state: z.string().exactOptional(),
  waitingFor: z.string().exactOptional(),
});

/** One row of `claude agents --json --all`; `kind`, `status`, `state` and `waitingFor` hold the CLI's raw text. */
export type SessionRow = z.infer<typeof rowSchema>;

/** The last list that `claude agents` printed, with what was wrong with it or with the latest call. */
export type SessionList = { rows: SessionRow[]; errors: SourceError[] };

export type SessionListSource = { read: (now: number) => Promise<SessionList> };

type ParsedList = { rows: SessionRow[]; rowErrors: SourceError[] };

function rowKey(row: SessionRow): string | undefined {
  return row.sessionId ?? row.id;
}

function unknownValueErrors(row: SessionRow): SourceError[] {
  const key = rowKey(row);
  const errors: SourceError[] = [];
  for (const [field, values] of knownValues) {
    const value = row[field];
    if (value === undefined) continue;
    if (values.includes(value)) continue;
    const message = `unknown ${field} value`;
    errors.push(key === undefined ? { source, message } : { source, sessionId: key, message });
  }
  return errors;
}

function rowIssueMessage(index: number, issues: readonly z.core.$ZodIssue[]): string {
  const details = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return `row ${index}: ${details.join("; ")}`;
}

function parseList(stdout: string): ParsedList {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("printed something other than JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("printed JSON that is not a list");
  const rows: SessionRow[] = [];
  const rowErrors: SourceError[] = [];
  for (const [index, candidate] of parsed.entries()) {
    const result = rowSchema.safeParse(candidate);
    if (!result.success) {
      rowErrors.push({ source, message: rowIssueMessage(index, result.error.issues) });
      continue;
    }
    rows.push(result.data);
    rowErrors.push(...unknownValueErrors(result.data));
  }
  return { rows, rowErrors };
}

// npm puts a `node_modules/.bin` on PATH for every ancestor directory, so a package's `bin` could stand in for `claude`.
function childPath(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const entries = path.split(delimiter);
  const kept = entries.filter((entry) => !entry.endsWith("/node_modules/.bin"));
  return kept.join(delimiter);
}

// Built from the code and signal only: the error's own message carries stderr, which can quote session content.
function callFailureMessage(error: ExecFileException): string {
  const command = `claude ${commandArguments.join(" ")}`;
  if (error.killed === true) return `${command} timed out after ${timeoutMilliseconds} ms`;
  if (error.code === "ENOENT") return "claude was not found on PATH";
  if (typeof error.code === "number") return `${command} exited with code ${error.code}`;
  if (error.code !== undefined) return `${command} failed with ${error.code}`;
  return `${command} was ended by ${error.signal ?? "an unnamed signal"}`;
}

function runList(): Promise<string> {
  const env = { ...process.env, PATH: childPath(process.env["PATH"]) };
  const options = { timeout: timeoutMilliseconds, killSignal: "SIGKILL" as const, cwd: homedir(), env };
  return new Promise((resolve, reject) => {
    // SIGKILL, because a child that ignores the default SIGTERM keeps the callback waiting past the timeout.
    execFile("claude", commandArguments, options, (error, stdout) => {
      if (error === null) resolve(stdout);
      else reject(new Error(callFailureMessage(error)));
    });
  });
}

/**
 * Runs `claude agents --json --all` at most once per 3 seconds of `now`, one call at a time. `read` waits for a call
 * only while no list has been read yet; otherwise it answers with the last list at once and refreshes behind it.
 */
export function createSessionListSource(): SessionListSource {
  let list: ParsedList | undefined;
  let callError: SourceError | undefined;
  let lastStartedAt: number | undefined;
  let inFlight: Promise<void> | undefined;

  function isDue(now: number): boolean {
    if (lastStartedAt === undefined) return true;
    const elapsed = now - lastStartedAt;
    // A clock set back would otherwise hold the list until it caught up.
    return elapsed >= refreshIntervalMilliseconds || elapsed < 0;
  }

  async function refresh(): Promise<void> {
    try {
      const stdout = await runList();
      list = parseList(stdout);
      callError = undefined;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      callError = { source, message };
    } finally {
      inFlight = undefined;
    }
  }

  function current(): SessionList {
    const rows = list?.rows ?? [];
    const rowErrors = list?.rowErrors ?? [];
    const errors = callError === undefined ? rowErrors : [...rowErrors, callError];
    return { rows, errors };
  }

  async function read(now: number): Promise<SessionList> {
    if (inFlight === undefined && isDue(now)) {
      lastStartedAt = now;
      inFlight = refresh();
    }
    if (list === undefined && inFlight !== undefined) await inFlight;
    return current();
  }

  return { read };
}
