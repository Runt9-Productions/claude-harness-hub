export const apiPrefix = "/api/";
export const snapshotPath = `${apiPrefix}snapshot`;

/** The hash that carries the launch token, which the page reads back with `readLaunchHash`. */
export const launchHashPrefix = "#t=";

/** The link the hub prints at startup, such as `http://127.0.0.1:47821/#t=<token>`. */
export function launchLink(port: number, token: string): string {
  return `http://127.0.0.1:${port}/${launchHashPrefix}${token}`;
}

export type SourceError = {
  source: string;
  sessionId?: string;
  message: string;
};

export type Delivery = "sending" | "sent" | "seen" | "failed";

export type Mode = "present" | "distracted" | "away";

export type Item = { label: string; isTicked: boolean };

export type DecisionView = {
  id: string;
  rev: number;
  createdAt?: number;
  question: string;
  context?: string;
  options: { label: string; description?: string }[];
  recommended?: number;
  askedBy?: string;
  plugin?: string;
  isAnswerKept: boolean;
  answer?: string;
  chosenOption?: string;
  /** Present only once answered. */
  note?: string;
  delivery?: Delivery;
};

export type OwnerTaskView = {
  id: string;
  rev: number;
  createdAt?: number;
  title: string;
  description?: string;
  postedBy?: string;
  items: Item[];
  isStartPressed: boolean;
  isDone: boolean;
  lastChange?: { summary: string; delivery: Delivery };
};

export type TaskView = {
  id: string;
  title: string;
  status: string;
  note?: string;
  holderId?: string;
  items: Item[];
};

export type SessionView = {
  /** `sessionId`, else the short `id`. */
  key: string;
  sessionId?: string;
  shortId?: string;
  name?: string;
  cwd: string;
  kind: string;
  startedAt: number;
  isProcessAlive: boolean;
  /** `status`, `state` and `waitingFor` hold the CLI's raw text, since it can add values. */
  status?: string;
  state?: string;
  waitingFor?: string;
  /** Absent when no store holds one; the view draws that as present. */
  mode?: Mode;
  decisions: DecisionView[];
  ownerTasks: OwnerTaskView[];
  tasks: TaskView[];
  needsYou: boolean;
  hasUnreadAnswers: boolean;
  canAnswer: boolean;
  canSetMode: boolean;
};

export type Snapshot = {
  runId: string;
  now: number;
  sessions: SessionView[];
  errors: SourceError[];
};
