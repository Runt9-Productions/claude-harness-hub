import { useEffect, useErrorBoundary, useState } from "preact/hooks";
import type { SessionView, SourceError, TaskView } from "../../shared/api.ts";
import {
  cardTasks,
  columnCount,
  groupSessions,
  isBlocked,
  isSamePlacement,
  placeInColumns,
  sessionState,
  shownTaskCount,
  type Columns,
} from "../logic/dashboard.ts";
import type { PageDispatch } from "../logic/page-state.ts";

function useViewportWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

type Tone = "attention" | "working" | "idle";

function sessionTone(session: SessionView): Tone {
  if (session.needsYou) return "attention";
  return sessionState(session) === "working" ? "working" : "idle";
}

function taskTone(task: TaskView): Tone {
  if (isBlocked(task)) return "attention";
  return task.status === "in_progress" ? "working" : "idle";
}

function StateLine({ session }: { session: SessionView }) {
  const state = sessionState(session);
  const shownState = session.waitingFor === undefined ? state : `${state} (${session.waitingFor})`;
  const mode = session.mode ?? "present";
  return (
    <p class="card-state">
      {session.kind}, {shownState},{" "}
      <span class="mode" data-mode={mode}>
        {mode}
      </span>
    </p>
  );
}

function TaskLine({ task }: { task: TaskView }) {
  const ticked = task.items.filter((item) => item.isTicked);
  const progress = task.items.length === 0 ? "" : `${ticked.length} of ${task.items.length}`;
  return (
    <li class="task-line">
      <span class="dot" data-tone={taskTone(task)} aria-hidden="true" />
      <span class="clip" title={task.title}>
        {task.title}
      </span>
      <span class="task-note" data-blocked={isBlocked(task)}>
        {isBlocked(task) ? "blocked" : progress}
      </span>
    </li>
  );
}

function Tasks({
  session,
  isExpanded,
  dispatch,
}: {
  session: SessionView;
  isExpanded: boolean;
  dispatch: PageDispatch;
}) {
  if (session.tasks.length === 0) return null;
  const tasks = cardTasks(session.tasks, isExpanded);
  const blocked = tasks.blockedCount === 0 ? "" : `, ${tasks.blockedCount} blocked`;
  return (
    <div class="tasks">
      <p class="minor-label">
        {tasks.doneCount} of {plural(session.tasks.length, "task")} done{blocked}
      </p>
      <ul class="task-lines">
        {tasks.shown.map((task) => (
          <TaskLine key={task.id} task={task} />
        ))}
      </ul>
      {tasks.openCount > shownTaskCount && (
        <button
          type="button"
          class="more"
          aria-expanded={isExpanded}
          onClick={() => dispatch({ kind: "cardToggled", key: session.key })}
        >
          {isExpanded ? "Show less" : `Show ${tasks.hiddenCount} more`}
        </button>
      )}
    </div>
  );
}

type CardProps = { session: SessionView; errors: readonly SourceError[]; isExpanded: boolean; dispatch: PageDispatch };

function Card({ session, errors, isExpanded, dispatch }: CardProps) {
  return (
    <article class="card" data-needs-you={session.needsYou}>
      <header class="card-head">
        <span class="dot" data-tone={sessionTone(session)} aria-hidden="true" />
        <h3 class="card-name">{session.name ?? session.shortId ?? session.key}</h3>
        {session.waitingCount > 0 && <span class="waiting-count">{session.waitingCount} waiting</span>}
      </header>
      <StateLine session={session} />
      <p class="card-dir">{session.cwd}</p>
      {!session.isProcessAlive && (
        <p class="card-stopped">
          process stopped
          {session.shortId !== undefined && (
            <>
              : <code>claude attach {session.shortId}</code> wakes it
            </>
          )}
        </p>
      )}
      {errors.map((error, index) => (
        <p key={index} class="card-error">
          {error.source}: {error.message}
        </p>
      ))}
      <Tasks session={session} isExpanded={isExpanded} dispatch={dispatch} />
    </article>
  );
}

// A caught render error reaches no window event, so the boundary logs it itself.
function CardBoundary(props: CardProps) {
  // Preact types the caught error as any.
  const boundary: [unknown, () => void] = useErrorBoundary((caught: unknown) => {
    console.error("hub: a session card failed to render", caught);
  });
  if (boundary[0] !== undefined) {
    return (
      <article class="card">
        <p class="card-error" role="alert">
          The card for {props.session.key} failed to draw. The browser console has the details.
        </p>
      </article>
    );
  }
  return <Card {...props} />;
}

type GroupProps = {
  label: string;
  sessions: readonly SessionView[];
  columns: number;
  errorsBySession: ReadonlyMap<string, SourceError[]>;
  expandedCards: ReadonlySet<string>;
  dispatch: PageDispatch;
};

/**
 * Holds the placement across renders, so a card keeps its column while it stays in the group. The state is set during
 * render only when the placement changed, so the render that follows places the same way and stops.
 */
function useHeldColumns(sessions: readonly SessionView[], count: number): Columns {
  const [held, setHeld] = useState<Columns>([]);
  const placed = placeInColumns(sessions, count, held);
  if (!isSamePlacement(placed, held)) setHeld(placed);
  return placed;
}

function Group({ label, sessions, columns, errorsBySession, expandedCards, dispatch }: GroupProps) {
  const placed = useHeldColumns(sessions, columns);
  if (sessions.length === 0) return null;
  return (
    <section class="group">
      <h2 class="group-label">
        {label} ({sessions.length})
      </h2>
      <div class="columns">
        {placed.map((column, index) => (
          <div key={index} class="column">
            {column.map((session) => (
              <CardBoundary
                key={session.key}
                session={session}
                errors={errorsBySession.get(session.key) ?? []}
                isExpanded={expandedCards.has(session.key)}
                dispatch={dispatch}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

type DashboardProps = Omit<GroupProps, "label" | "sessions" | "columns"> & { sessions: readonly SessionView[] };

export function Dashboard({ sessions, ...rest }: DashboardProps) {
  const viewportWidth = useViewportWidth();
  const columns = columnCount(viewportWidth);
  if (sessions.length === 0) return <p class="empty">No sessions are listed.</p>;
  const groups = groupSessions(sessions);
  return (
    <>
      <Group label="Needs you" sessions={groups.needsYou} columns={columns} {...rest} />
      <Group label="Everything else" sessions={groups.everythingElse} columns={columns} {...rest} />
    </>
  );
}
