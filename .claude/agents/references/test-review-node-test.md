# Test review reference: node:test

Read by `test-review:test-reviewer` for `src/**/*.test.ts`. These use `node:test` and `node:assert/strict`, and Node
runs them from TypeScript by stripping types.

## Failure modes

Also apply the "Test-quality traps" section of `.claude/code-review-profile.md`.

1. **A cast that admits fiction.** `as unknown as` on a fixture lets it carry a shape no real source produces, so a
   validator test passes on input that cannot happen. Criterion 3 applies.
2. **An assertion inside a callback that never runs.** An `assert` in a handler, a `then` or an event listener that
   the code under test never calls passes silently. Check that the test awaits the call or counts it with
   `t.mock.fn()` and asserts on `mock.callCount()`.
3. **A test that returns before its promise settles.** A test function that starts async work without awaiting it
   ends green before the work fails.
4. **An empty result that is the starting state.** `assert.deepEqual(items, [])` holds when nothing ran. It proves
   something only beside a sibling test showing the same path can fill it.

## Running a forced failure

`node --test <file>` runs one file; read the `✖` lines and the `ℹ pass` and `ℹ fail` counts. Each file runs in its
own child process, so a failure in one does not stop the others.
