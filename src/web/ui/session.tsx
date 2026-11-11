import type { SessionView } from "../../shared/api.ts";

export function StoppedLine({ session }: { session: SessionView }) {
  if (session.isProcessAlive) return null;
  return (
    <p class="stopped">
      process stopped
      {session.shortId !== undefined && (
        <>
          : <code>claude attach {session.shortId}</code> wakes it
        </>
      )}
    </p>
  );
}
