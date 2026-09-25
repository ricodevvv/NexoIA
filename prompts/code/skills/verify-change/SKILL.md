---
name: verify-change
description: Confirm a change does what it is supposed to by running it, not just by typechecking it. Use before committing anything with behaviour behind it.
---

# Verifying a change

A green typecheck says the code is well formed. It says nothing about whether it
works. Exercise the thing.

## Decide what to run

| Change | How to know it works |
| --- | --- |
| Pure logic | The unit test that would fail without the change, plus its neighbours |
| API route or server action | Call it. Vitest, or a request against `pnpm dev` |
| Database change | Migrate on a scratch database and read the row back |
| UI or styling | Open it in a browser and look at it |
| Prompt, tool description or system prompt | Send a real request and read what the model did |
| Provider integration | One real call against the provider, not a mock |

The third column is the point of this skill. Pick the row that matches the
change, then do that.

## The loop

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm dev
```

Then drive the affected path. If the repo has an end-to-end spec for it, run
that spec. If it does not, drive it by hand and say what you observed.

## Rules

- Run the check before you claim it. Report the real output, including the
  failing test name and the line.
- A test that cannot fail is not a check. Break the code on purpose once and
  confirm the test goes red, then fix it back.
- Report what you observed, not what you expected: "the widget renders and the
  chart shows 4 bars" beats "should work".
- If you could not verify something, say which part and why. A verified change
  with one stated gap is worth more than a confident claim.
- Leave the tree as you found it: no leftover debug files, no commented-out
  blocks, no stray console logs.
