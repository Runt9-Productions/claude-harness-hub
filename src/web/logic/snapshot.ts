import type { Snapshot, SourceError } from "../../shared/api.ts";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null) return false;
  return !Array.isArray(value);
}

function readString(record: JsonObject, field: string, where: string): string {
  const value = record[field];
  if (typeof value !== "string") throw new Error(`${where} field ${field} is not a string`);
  return value;
}

function readSourceError(value: unknown): SourceError {
  if (!isJsonObject(value)) throw new Error("snapshot errors entry is not an object");
  const error: SourceError = {
    source: readString(value, "source", "snapshot errors entry"),
    message: readString(value, "message", "snapshot errors entry"),
  };
  if (value["sessionId"] === undefined) return error;
  return { ...error, sessionId: readString(value, "sessionId", "snapshot errors entry") };
}

export type RunSnapshot = { kind: "restarted" } | { kind: "snapshot"; snapshot: Snapshot };

/**
 * Narrows the body, or answers `restarted` when its `runId` is not `knownRunId`. The `runId` is compared before
 * narrowing, since a restarted hub may serve a shape this build rejects.
 */
export function readRunSnapshot(body: unknown, knownRunId: string | undefined): RunSnapshot {
  if (!isJsonObject(body)) throw new Error("snapshot is not an object");
  const runId = readString(body, "runId", "snapshot");
  if (knownRunId !== undefined && runId !== knownRunId) return { kind: "restarted" };
  return { kind: "snapshot", snapshot: readSnapshot(body) };
}

/** Narrows a `GET /api/snapshot` body to `Snapshot`, throwing with the name of the first field that does not fit. */
export function readSnapshot(body: unknown): Snapshot {
  if (!isJsonObject(body)) throw new Error("snapshot is not an object");
  const now = body["now"];
  if (typeof now !== "number") throw new Error("snapshot field now is not a number");
  const sessions = body["sessions"];
  // No source lists sessions yet, so the type allows only an empty list.
  if (!Array.isArray(sessions) || sessions.length > 0) throw new Error("snapshot field sessions is not an empty list");
  const errors = body["errors"];
  if (!Array.isArray(errors)) throw new Error("snapshot field errors is not a list");
  return { runId: readString(body, "runId", "snapshot"), now, sessions: [], errors: errors.map(readSourceError) };
}
