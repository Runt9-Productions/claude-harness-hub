# claude-harness-hub knowledge base

Notes an agent reads before the code or the tool behaviour they cover. The format is the reference-kb plugin's;
`kb.toml` declares what this knowledge base adds.

## Entry points

| Note | Read it before |
|---|---|
| [CI Checks](domains/ci/overview.md) | changing `.github/workflows/ci.yml` or a config it reads, or trusting a green check |

## Local conventions

- **The repository is public.** Notes hold generic facts only: no machine paths, private project names, ids or
  addresses. The leak scan and the code review read notes like any other file.
- **Tool facts carry `measured_on`**, naming each tool and version they were measured on. Re-measure on a newer
  version before depending on one.
- **`[vendor]`** is a claim from a tool's documentation that was not measured here.
- **A Scope line cites the pull request (`#NNN`) the sources were read on, never a branch commit**, since pull
  requests squash-merge.
- **`[decision]` lines name the owner and the date, with the reason in one line.**
