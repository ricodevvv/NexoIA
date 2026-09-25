---
name: review
description: Review pending changes on the branch and report what is actually wrong. Use before committing, when asked for a code review, or when checking someone else's work.
---

# Reviewing changes

Review the diff, not the intention behind it. The person who wrote it is not in
the room, and the commit message is not evidence.

## Get the change

```bash
git status --short
git diff                # unstaged
git diff --staged       # staged
git diff main...HEAD    # everything on the branch
git log --oneline -10
```

For a branch review, compare against the base rather than the last commit, so
renames and reverts are visible. If the working tree is dirty, review the
combination the user is about to commit, not half of it.

## Read for, in this order

1. **Correctness.** Does it do what it claims, including the edge cases? Trace
   the failure paths, not the happy one.
2. **Contract breaks.** Changed function signatures, zod schemas, API routes,
   database columns, tool names and tool descriptions the model reads. Anything
   a prompt depends on is an interface.
3. **Data and migrations.** Missing `not null`, an index that a new query needs,
   a column added without a default on a table with rows.
4. **Security.** Unvalidated input reaching a query, a file path or a URL.
   Secrets in code, logs or prompts. Auth checks missing on a new route.
5. **Tests.** Is there a test that fails without this change? A test that would
   pass either way is worse than none.
6. **Fit with the codebase.** Does it match the conventions around it, or did it
   arrive from a different project?

## Report

For each finding, in this shape:

```text
<file>:<line> — one sentence on what is wrong and the input that triggers it.
```

Then group them: what must be fixed before committing, what should be fixed, and
what is a note rather than a problem. Rank by consequence, not by how easy it is
to explain. Say plainly when something is correct; a review with no praise is
as useless as one with no criticism.

## Stop yourself from

- Reporting style preferences as defects. Formatting is what `pnpm lint` is for.
- Guessing about code you did not open. Read it or leave it out.
- Inventing a failure mode to look thorough. If you cannot describe concrete
  input that produces the bug, it is a suggestion, not a finding.
- Reviewing the whole file when the change touches four lines.
