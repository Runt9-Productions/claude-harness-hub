import type {
  DecisionView,
  Item,
  Mode,
  OwnerTaskView,
  SessionView,
  Snapshot,
  SourceError,
  TaskView,
} from "../../shared/api.ts";

// Declared here rather than imported, since `hub` may import only `shared`; `main.ts` passes the sources' own
// output, so `tsc` checks there that these still fit it.

/** One validated row of `claude agents --json --all`. */
export type ListedSession = {
  cwd: string;
  kind: string;
  startedAt: number;
  id?: string;
  sessionId?: string;
  name?: string;
  pid?: number;
  status?: string;
  state?: string;
  waitingFor?: string;
};

type StoredDecision = DecisionView & { agentId?: string };

type StoredOwnerTask = OwnerTaskView & { agentId?: string };

type StoredBoard = {
  decisions: readonly StoredDecision[];
  tasks: readonly TaskView[];
  ownerTasks: readonly StoredOwnerTask[];
};

/** What the stores hold for one session; a field is absent when no store holds it or it failed validation. */
export type StoredSession = { board?: StoredBoard; mode?: Mode };

export type SnapshotInput = {
  runId: string;
  now: number;
  list: { rows: readonly ListedSession[]; errors: readonly SourceError[] };
  /** Holds an entry for every listed `sessionId`. */
  stores: { sessions: ReadonlyMap<string, StoredSession>; errors: readonly SourceError[] };
};

const emptyBoard: StoredBoard = { decisions: [], tasks: [], ownerTasks: [] };

const activeStates: readonly string[] = ["working", "blocked"];
const endedStates: readonly string[] = ["done", "failed", "stopped"];

function isUnanswered(decision: StoredDecision): boolean {
  return decision.answer === undefined;
}

function isUnfinished(ownerTask: StoredOwnerTask): boolean {
  return !ownerTask.isDone;
}

function waitingCount(board: StoredBoard): number {
  const unanswered = board.decisions.filter(isUnanswered);
  const unfinished = board.ownerTasks.filter(isUnfinished);
  return unanswered.length + unfinished.length;
}

function holdsOwnerWork(board: StoredBoard): boolean {
  return waitingCount(board) > 0;
}

// Without the last rule, a stopped session's pending decision would leave the dashboard while it still waits.
function isShown(row: ListedSession, board: StoredBoard): boolean {
  if (row.pid !== undefined) return true;
  if (row.state === undefined) return false;
  if (activeStates.includes(row.state)) return true;
  return endedStates.includes(row.state) && holdsOwnerWork(board);
}

function needsYou(row: ListedSession, board: StoredBoard): boolean {
  if (row.status === "waiting") return true;
  if (row.state === "blocked") return true;
  return holdsOwnerWork(board);
}

// An item with an `agentId` belongs to a subagent, which the board plugin's unread test leaves out.
function isUnreadDecision(decision: StoredDecision): boolean {
  return decision.agentId === undefined && decision.delivery === "sent";
}

function isUnreadOwnerTask(ownerTask: StoredOwnerTask): boolean {
  return ownerTask.agentId === undefined && ownerTask.lastChange?.delivery === "sent";
}

function hasUnreadAnswers(board: StoredBoard): boolean {
  if (board.decisions.some(isUnreadDecision)) return true;
  return board.ownerTasks.some(isUnreadOwnerTask);
}

function copyItems(items: readonly Item[]): Item[] {
  return items.map((item) => ({ label: item.label, isTicked: item.isTicked }));
}

function optionView(option: DecisionView["options"][number]): DecisionView["options"][number] {
  if (option.description === undefined) return { label: option.label };
  return { label: option.label, description: option.description };
}

function decisionView(decision: StoredDecision): DecisionView {
  const view: DecisionView = {
    id: decision.id,
    rev: decision.rev,
    question: decision.question,
    options: decision.options.map(optionView),
    isAnswerKept: decision.isAnswerKept,
  };
  if (decision.createdAt !== undefined) view.createdAt = decision.createdAt;
  if (decision.context !== undefined) view.context = decision.context;
  if (decision.recommended !== undefined) view.recommended = decision.recommended;
  if (decision.askedBy !== undefined) view.askedBy = decision.askedBy;
  if (decision.plugin !== undefined) view.plugin = decision.plugin;
  const answer = decision.answer;
  // A note on an unanswered decision is a draft the owner has not sent.
  if (answer === undefined) return view;
  view.answer = answer;
  if (decision.chosenOption !== undefined) view.chosenOption = decision.chosenOption;
  if (decision.note !== undefined) view.note = decision.note;
  if (decision.delivery !== undefined) view.delivery = decision.delivery;
  return view;
}

function ownerTaskView(ownerTask: StoredOwnerTask): OwnerTaskView {
  const view: OwnerTaskView = {
    id: ownerTask.id,
    rev: ownerTask.rev,
    title: ownerTask.title,
    items: copyItems(ownerTask.items),
    isStartPressed: ownerTask.isStartPressed,
    isDone: ownerTask.isDone,
  };
  if (ownerTask.createdAt !== undefined) view.createdAt = ownerTask.createdAt;
  if (ownerTask.description !== undefined) view.description = ownerTask.description;
  if (ownerTask.postedBy !== undefined) view.postedBy = ownerTask.postedBy;
  const lastChange = ownerTask.lastChange;
  if (lastChange !== undefined) view.lastChange = { summary: lastChange.summary, delivery: lastChange.delivery };
  return view;
}

function taskView(task: TaskView): TaskView {
  const view: TaskView = { id: task.id, title: task.title, status: task.status, items: copyItems(task.items) };
  if (task.note !== undefined) view.note = task.note;
  if (task.holderId !== undefined) view.holderId = task.holderId;
  return view;
}

function sessionView(key: string, row: ListedSession, stored: StoredSession, board: StoredBoard): SessionView {
  const view: SessionView = {
    key,
    cwd: row.cwd,
    kind: row.kind,
    startedAt: row.startedAt,
    isProcessAlive: row.pid !== undefined,
    decisions: board.decisions.map(decisionView),
    ownerTasks: board.ownerTasks.map(ownerTaskView),
    tasks: board.tasks.map(taskView),
    needsYou: needsYou(row, board),
    waitingCount: waitingCount(board),
    hasUnreadAnswers: hasUnreadAnswers(board),
    // No `hub` plugin connects yet, so nothing can reach a session.
    canAnswer: false,
    canSetMode: false,
  };
  if (row.sessionId !== undefined) view.sessionId = row.sessionId;
  if (row.id !== undefined) view.shortId = row.id;
  if (row.name !== undefined) view.name = row.name;
  if (row.status !== undefined) view.status = row.status;
  if (row.state !== undefined) view.state = row.state;
  if (row.waitingFor !== undefined) view.waitingFor = row.waitingFor;
  if (stored.mode !== undefined) view.mode = stored.mode;
  return view;
}

function storedSession(input: SnapshotInput, row: ListedSession): StoredSession {
  // The stores are keyed by the full session id, so a row with only a short id has nothing stored.
  if (row.sessionId === undefined) return {};
  const stored = input.stores.sessions.get(row.sessionId);
  if (stored === undefined) throw new Error("the store read has no entry for a listed sessionId");
  return stored;
}

/** Builds the snapshot from one read of each source, copying only the fields the browser is meant to see. */
export function buildSnapshot(input: SnapshotInput): Snapshot {
  const sessions: SessionView[] = [];
  const errors: SourceError[] = [...input.list.errors, ...input.stores.errors];
  for (const row of input.list.rows) {
    const key = row.sessionId ?? row.id;
    if (key === undefined) {
      errors.push({ source: "claude agents", message: "a row has neither sessionId nor id" });
      continue;
    }
    const stored = storedSession(input, row);
    const board = stored.board ?? emptyBoard;
    if (isShown(row, board)) sessions.push(sessionView(key, row, stored, board));
  }
  return { runId: input.runId, now: input.now, sessions, errors };
}
