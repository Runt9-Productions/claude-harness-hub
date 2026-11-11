import type { SessionView } from "../../shared/api.ts";

export function sessionName(session: SessionView): string {
  return session.name ?? session.shortId ?? session.key;
}

export function byStart(first: SessionView, second: SessionView): number {
  return first.startedAt - second.startedAt;
}
