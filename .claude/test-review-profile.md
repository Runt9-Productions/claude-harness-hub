# Test review profile

Facts about this repository's tests that `/test-review` and its `test-review:test-reviewer` agent need.

## Default branch

`main`. With no paths given, the skill reviews test files changed against the merge base with it.

## Test kinds

| Kind | Files | Helpers | Run | Reading the result |
|---|---|---|---|---|
| node:test | `src/**/*.test.ts` | none yet | `node --test <file>`, or one test with `node --test --test-name-pattern='<regex>' <file>` | one `✔` or `✖` line per test, then `ℹ tests N`, `ℹ pass N` and `ℹ fail N` |
| Playwright | `src/e2e/*.e2e.ts` | `src/e2e/playwright.config.ts`, `src/e2e/fixture-main.ts` and the fake plugin that speaks the socket routes | `npx playwright test -c src/e2e/playwright.config.ts <file>`, or one test with `-g '<regex>'` added | one line per test, then a count line each for passed, failed and skipped |

Production code is every file that is neither a test nor a helper listed above.

## Checks on every scoped file

- **It has tests.** `node --test` passes a file with no tests in it, so read `ℹ tests N` rather than the exit status.
- **CI runs it.** The `tests` job in `.github/workflows/ci.yml` runs every `src/**/*.test.ts`, and the browser test
  job every `src/e2e/*.e2e.ts`; a test file named otherwise never runs.
- **Lint.** `tsc`, oxlint and Prettier run over test files too, so a fix must pass all three (`CLAUDE.md`,
  "Checks").

## Reference files

| Kind | Reference |
|---|---|
| node:test | `.claude/agents/references/test-review-node-test.md` |

## Suite policy

From the "Writing here" rule in `CLAUDE.md` that tests are few, at the boundaries, with obviously synthetic fixtures.
Criterion 4 judges each test against it:

- **Boundaries.** Drive the hub the way its callers do (an HTTP request to the server, a file in a fixture config
  dir, a held request on the plugin socket, a page in the browser) and assert on what comes back out. A direct test
  of a pure function is kept when a break of that function is caught by no boundary test.
- **One test per decision.** Each distinct decision the code makes gets one test. A second test of the same decision
  is redundant.
- **Refusals.** A test that proves a request, path or input is refused is always wanted and never deleted as
  redundant.
- **Fake fixtures.** Test data ships publicly, so it is plainly synthetic: `example.com`, invented session ids, made-up
  names. A test never reads the real `~/.claude`.
