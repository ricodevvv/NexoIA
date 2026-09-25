---
description: Summarize the session so far into a compact brief that keeps the work going
---

Summarize the conversation so far so it can replace the history. Do not reply to
the user, do not run tools, and do not ask anything.

$ARGUMENTS

Write the summary in this structure:

**Goal** — one or two sentences on what the user is trying to get done.

**State** — what is already working, with file paths and identifiers.

**Decisions** — the choices that were made along the way, and the reason given
for each. Include anything the user corrected.

**Open** — what was left unfinished, and what remains to be done, in order.

**Next** — the single next action, and the exact command or file edit that
performs it.

**Gotchas** — constraints discovered along the way: failing commands, wrong
assumptions, files that do not exist, conventions that must be followed.

Rules:

- Keep the user's own terms for files, functions and features. Do not rename
  things in the summary.
- Record the exact text of errors and commands that failed, since the next
  context will not have them.
- Keep code identifiers exactly as they appear. No paraphrasing of names.
- No preamble, no closing line, no offer to continue.
