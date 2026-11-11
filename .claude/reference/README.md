# claude-harness-hub knowledge base

Notes an agent reads before the code or the tool behaviour they cover. The format is the reference-kb plugin's;
`kb.toml` declares what this knowledge base adds.

## Entry points

| Note | Read it before |
|---|---|
| [CI Checks](domains/ci/overview.md) | changing `.github/workflows/ci.yml` or a config it reads, or trusting a green check |
| [Hub Architecture](domains/hub/overview.md) | creating or moving a file under `src/`, or adding an import between modules or a schema |
| [Hub Browser Surface](domains/hub/browser-surface.md) | touching startup, the token, request checks, response headers, the HTTP API or polling |
| [Hub Browser Code](domains/hub/browser-code.md) | touching `src/web/`, the asset table or the browser build |
| [Hub Outside State](domains/hub/outside-state.md) | touching `src/server/sources/`, the snapshot builder or a store schema |
| [Hub Plugin Socket](domains/hub/plugin-socket.md) | touching the socket, its routes, reports or the `hub` plugin's side of the contract |
| [Hub Commands](domains/hub/commands.md) | touching `POST /api/commands`, the command queue or how a plugin applies a command |
| [Hub Tests](domains/hub/tests.md) | writing a test, a fixture or the fixture script |
| [Claude Agents JSON List](domains/platform/claude-agents-json.md) | writing the session list's schema or fixtures |
| [Chrome Hidden Tab Timers](domains/platform/chrome-hidden-tab-timers.md) | changing the poll interval or relying on Chrome to slow a hidden tab |
| [Hub Skeleton](projects/hub-skeleton/overview.md) | building the first slice, issue #5 |

## Local conventions

- **The repository is public.** Notes hold generic facts only: no machine paths, private project names, ids or
  addresses. The leak scan and the code review read notes like any other file.
- **Tool facts carry `measured_on`**, naming each tool and version they were measured on. Re-measure on a newer
  version before depending on one.
- **`[vendor]`** is a claim from a tool's documentation that was not measured here.
- **A Scope line cites the pull request (`#NNN`) the sources were read on, never a branch commit**, since pull
  requests squash-merge.
- **`[decision]` lines name the owner and the date, with the reason in one line.**
