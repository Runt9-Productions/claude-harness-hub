import type { ComponentChildren } from "preact";
import type { DecisionView, OwnerTaskView, SessionView, Snapshot } from "../../shared/api.ts";
import { openRowKey, type OpenRowChoice, type PageDispatch } from "../logic/page-state.ts";
import { sessionName } from "../logic/session.ts";
import { heldLine, rowAge, waitingList, type WaitingRow } from "../logic/waiting.ts";
import { laterReason } from "./later.ts";
import { StoppedLine } from "./session.tsx";

type Emphasis = "recommended" | "quiet";

function LaterButton({
  label,
  note,
  emphasis,
}: {
  label: string;
  note?: string | undefined;
  emphasis?: Emphasis | undefined;
}) {
  return (
    <button type="button" class="action" data-emphasis={emphasis} disabled title={laterReason}>
      {label}
      {note !== undefined && <span class="action-note">{note}</span>}
    </button>
  );
}

function DecisionBody({ decision }: { decision: DecisionView }) {
  return (
    <>
      {decision.context !== undefined && <p class="row-text">{decision.context}</p>}
      <div class="row-actions">
        {decision.options.map((option, index) => {
          const isRecommended = index === decision.recommended;
          return (
            <LaterButton
              key={index}
              label={isRecommended ? `${option.label} (recommended)` : option.label}
              note={option.description}
              emphasis={isRecommended ? "recommended" : undefined}
            />
          );
        })}
        <LaterButton label="Dismiss" emphasis="quiet" />
      </div>
    </>
  );
}

function OwnerTaskBody({ ownerTask }: { ownerTask: OwnerTaskView }) {
  return (
    <>
      {ownerTask.description !== undefined && <p class="row-text">{ownerTask.description}</p>}
      {ownerTask.items.length > 0 && (
        <ul class="checklist">
          {ownerTask.items.map((item, index) => (
            <li key={index}>
              <label>
                <input type="checkbox" checked={item.isTicked} disabled title={laterReason} />
                {item.label}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div class="row-actions">
        {ownerTask.isStartPressed ? <span class="started">Started</span> : <LaterButton label="Start" />}
        <LaterButton label="Done" />
      </div>
    </>
  );
}

type RowProps = {
  row: WaitingRow<{ createdAt?: number }>;
  title: string;
  now: number;
  isOpen: boolean;
  dispatch: PageDispatch;
  children: ComponentChildren;
};

function Row({ row, title, now, isOpen, dispatch, children }: RowProps) {
  function toggle(): void {
    dispatch(isOpen ? { kind: "rowClosed" } : { kind: "rowOpened", key: row.key });
  }
  return (
    <li class="row" data-open={isOpen}>
      <button type="button" class="row-head" aria-expanded={isOpen} onClick={toggle}>
        <span class="row-session clip">{sessionName(row.session)}</span>
        <span class="row-title">{title}</span>
        <span class="row-age">{rowAge(row.item.createdAt, now)}</span>
        <span class="row-chevron" aria-hidden="true">
          {isOpen ? "▾" : "▸"}
        </span>
      </button>
      {isOpen && (
        <div class="row-body">
          <StoppedLine session={row.session} />
          {children}
        </div>
      )}
    </li>
  );
}

function RowList({
  label,
  rowCount,
  emptyText,
  children,
}: {
  label: string;
  rowCount: number;
  emptyText: string;
  children: ComponentChildren;
}) {
  return (
    <section class="row-list">
      <h2 class="group-label">
        {label} ({rowCount})
      </h2>
      {rowCount === 0 ? <p class="empty">{emptyText}</p> : <ul class="rows">{children}</ul>}
    </section>
  );
}

function Held({ held }: { held: readonly SessionView[] }) {
  if (held.length === 0) return null;
  return (
    <section class="row-list">
      <h3 class="group-label">Held in a terminal</h3>
      <ul class="held-lines">
        {held.map((session) => (
          <li key={session.key}>{heldLine(session)}</li>
        ))}
      </ul>
    </section>
  );
}

type WaitingViewProps = { snapshot: Snapshot; openRow: OpenRowChoice; dispatch: PageDispatch };

export function WaitingView({ snapshot, openRow, dispatch }: WaitingViewProps) {
  const list = waitingList(snapshot.sessions);
  const openKey = openRowKey(openRow, list);
  return (
    <div class="waiting">
      <div class="waiting-column">
        <RowList
          label="Decisions, oldest first"
          rowCount={list.decisions.length}
          emptyText="No decisions are waiting on you."
        >
          {list.decisions.map((row) => (
            <Row
              key={row.key}
              row={row}
              title={row.item.question}
              now={snapshot.now}
              isOpen={row.key === openKey}
              dispatch={dispatch}
            >
              <DecisionBody decision={row.item} />
            </Row>
          ))}
        </RowList>
        <Held held={list.held} />
      </div>
      <div class="waiting-column" data-layout="stacked">
        <RowList label="Tasks, oldest first" rowCount={list.ownerTasks.length} emptyText="No tasks are waiting on you.">
          {list.ownerTasks.map((row) => (
            <Row
              key={row.key}
              row={row}
              title={row.item.title}
              now={snapshot.now}
              isOpen={row.key === openKey}
              dispatch={dispatch}
            >
              <OwnerTaskBody ownerTask={row.item} />
            </Row>
          ))}
        </RowList>
      </div>
    </div>
  );
}
