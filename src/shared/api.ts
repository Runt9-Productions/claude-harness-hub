export const apiPrefix = "/api/";
export const snapshotPath = `${apiPrefix}snapshot`;

export type SourceError = {
  source: string;
  sessionId?: string;
  message: string;
};

export type Snapshot = {
  runId: string;
  now: number;
  sessions: [];
  errors: SourceError[];
};
