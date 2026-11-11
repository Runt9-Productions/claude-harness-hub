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

export type Snapshot = {
  runId: string;
  now: number;
  sessions: [];
  errors: SourceError[];
};
