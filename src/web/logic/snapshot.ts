import {
  deliveries,
  modes,
  type DecisionView,
  type Item,
  type OwnerTaskView,
  type SessionView,
  type Snapshot,
  type SourceError,
  type TaskView,
} from "../../shared/api.ts";

/** Narrows `value` or throws naming `where`, the path to the value, such as `snapshot field sessions entry 0`. */
type Narrow<T> = (value: unknown, where: string) => T;

type Fields = {
  required<T>(field: string, narrow: Narrow<T>): T;
  /** Absent reads as `{}`, so the result spreads into the object being built. */
  optional<K extends string, T>(field: K, narrow: Narrow<T>): Partial<Record<K, T>>;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  return !Array.isArray(value);
}

function string(value: unknown, where: string): string {
  if (typeof value !== "string") throw new Error(`${where} is not a string`);
  return value;
}

function number(value: unknown, where: string): number {
  if (typeof value !== "number") throw new Error(`${where} is not a number`);
  return value;
}

function boolean(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${where} is not a boolean`);
  return value;
}

function oneOf<T extends string>(values: readonly T[]): Narrow<T> {
  return (value, where) => {
    const found = values.find((candidate) => candidate === value);
    if (found === undefined) throw new Error(`${where} is not one of ${values.join(", ")}`);
    return found;
  };
}

function listOf<T>(narrowEntry: Narrow<T>): Narrow<T[]> {
  return (value, where) => {
    if (!Array.isArray(value)) throw new Error(`${where} is not a list`);
    return value.map((entry: unknown, index) => narrowEntry(entry, `${where} entry ${index}`));
  };
}

/** Builds only the fields `build` names, so a field the hub adds later never reaches the page unread. */
function objectOf<T>(build: (fields: Fields) => T): Narrow<T> {
  return (value, where) => {
    if (!isJsonObject(value)) throw new Error(`${where} is not an object`);
    const fields: Fields = {
      required: (field, narrow) => narrow(value[field], `${where} field ${field}`),
      optional: <Key extends string, Value>(field: Key, narrow: Narrow<Value>) => {
        const read: Partial<Record<Key, Value>> = {};
        const fieldValue = value[field];
        if (fieldValue === undefined) return read;
        read[field] = narrow(fieldValue, `${where} field ${field}`);
        return read;
      },
    };
    return build(fields);
  };
}

const delivery = oneOf(deliveries);
const mode = oneOf(modes);

const item = objectOf<Item>((fields) => ({
  label: fields.required("label", string),
  isTicked: fields.required("isTicked", boolean),
}));

const option = objectOf<DecisionView["options"][number]>((fields) => ({
  label: fields.required("label", string),
  ...fields.optional("description", string),
}));

const decision = objectOf<DecisionView>((fields) => ({
  id: fields.required("id", string),
  rev: fields.required("rev", number),
  ...fields.optional("createdAt", number),
  question: fields.required("question", string),
  ...fields.optional("context", string),
  options: fields.required("options", listOf(option)),
  ...fields.optional("recommended", number),
  ...fields.optional("askedBy", string),
  ...fields.optional("plugin", string),
  isAnswerKept: fields.required("isAnswerKept", boolean),
  ...fields.optional("answer", string),
  ...fields.optional("chosenOption", string),
  ...fields.optional("note", string),
  ...fields.optional("delivery", delivery),
}));

const lastChange = objectOf<NonNullable<OwnerTaskView["lastChange"]>>((fields) => ({
  summary: fields.required("summary", string),
  delivery: fields.required("delivery", delivery),
}));

const ownerTask = objectOf<OwnerTaskView>((fields) => ({
  id: fields.required("id", string),
  rev: fields.required("rev", number),
  ...fields.optional("createdAt", number),
  title: fields.required("title", string),
  ...fields.optional("description", string),
  ...fields.optional("postedBy", string),
  items: fields.required("items", listOf(item)),
  isStartPressed: fields.required("isStartPressed", boolean),
  isDone: fields.required("isDone", boolean),
  ...fields.optional("lastChange", lastChange),
}));

const task = objectOf<TaskView>((fields) => ({
  id: fields.required("id", string),
  title: fields.required("title", string),
  status: fields.required("status", string),
  ...fields.optional("note", string),
  ...fields.optional("holderId", string),
  items: fields.required("items", listOf(item)),
}));

const session = objectOf<SessionView>((fields) => ({
  key: fields.required("key", string),
  ...fields.optional("sessionId", string),
  ...fields.optional("shortId", string),
  ...fields.optional("name", string),
  cwd: fields.required("cwd", string),
  kind: fields.required("kind", string),
  startedAt: fields.required("startedAt", number),
  isProcessAlive: fields.required("isProcessAlive", boolean),
  ...fields.optional("status", string),
  ...fields.optional("state", string),
  ...fields.optional("waitingFor", string),
  ...fields.optional("mode", mode),
  decisions: fields.required("decisions", listOf(decision)),
  ownerTasks: fields.required("ownerTasks", listOf(ownerTask)),
  tasks: fields.required("tasks", listOf(task)),
  needsYou: fields.required("needsYou", boolean),
  waitingCount: fields.required("waitingCount", number),
  hasUnreadAnswers: fields.required("hasUnreadAnswers", boolean),
  canAnswer: fields.required("canAnswer", boolean),
  canSetMode: fields.required("canSetMode", boolean),
}));

const sourceError = objectOf<SourceError>((fields) => ({
  source: fields.required("source", string),
  ...fields.optional("sessionId", string),
  message: fields.required("message", string),
}));

const snapshot = objectOf<Snapshot>((fields) => ({
  runId: fields.required("runId", string),
  now: fields.required("now", number),
  sessions: fields.required("sessions", listOf(session)),
  errors: fields.required("errors", listOf(sourceError)),
}));

export type RunSnapshot = { kind: "restarted" } | { kind: "snapshot"; snapshot: Snapshot };

/**
 * Narrows the body, or answers `restarted` when its `runId` is not `knownRunId`. The `runId` is compared before
 * narrowing, since a restarted hub may serve a shape this build rejects.
 */
export function readRunSnapshot(body: unknown, knownRunId: string | undefined): RunSnapshot {
  if (!isJsonObject(body)) throw new Error("snapshot is not an object");
  const runId = string(body["runId"], "snapshot field runId");
  if (knownRunId !== undefined && runId !== knownRunId) return { kind: "restarted" };
  return { kind: "snapshot", snapshot: readSnapshot(body) };
}

/** Narrows a `GET /api/snapshot` body to `Snapshot`, throwing with the path of the first field that does not fit. */
export function readSnapshot(body: unknown): Snapshot {
  return snapshot(body, "snapshot");
}
