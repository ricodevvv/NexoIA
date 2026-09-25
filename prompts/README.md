# Nexo prompts

The prompts, skills, styles, agents and commands that make Nexo behave like
Nexo. Written for this codebase, checked against it, and in English so they can
be translated once at integration time instead of in every file.

Start with `integration.md`. It lists the real file paths, the frontmatter each
loader accepts, and the checks to run after wiring things up.

## Chat

| File | What it is |
| --- | --- |
| `chat/system-prompt.md` | Rewrites `src/lib/ai/system.ts`: base rules, visual output, research mode |
| `chat/styles/normal.md` | The default, with empty instructions on purpose |
| `chat/styles/concise.md` | Shortest answer that is still complete |
| `chat/styles/explanatory.md` | Teaching register, from the basics up |
| `chat/styles/coach.md` | Socratic, hands the user a piece to write |
| `chat/styles/technical.md` | Peer register, precise, no hand-holding |

## Chat skills

Loaded only if the chat grows a way to read them. `integration.md` section 4
covers the three options and what each one costs.

| Skill | When it earns its place |
| --- | --- |
| `artifact-craft` | The artifact runtime, its hard limits and how to avoid a broken preview |
| `chart-design` | Choosing a form, the widget's schema, and figures with matplotlib |
| `diagramming` | Mermaid against the diagram widget against inline SVG |
| `research` | Splitting the question, cross-checking, citing without inventing |
| `python-analysis` | The sandbox: preloaded packages, micropip, internet through a proxy, 120 seconds, one run |

## Nexo Code

| File | What it is |
| --- | --- |
| `code/AGENTS.md` | Global instructions for the agent in every workspace pod: toolchains, internet, tools, delivery |
| `code/skills/run-nexo/SKILL.md` | Commands, the Next.js version, the env vars that gate features |
| `code/skills/review/SKILL.md` | What to look for in a diff, and the shape of the report |
| `code/skills/verify-change/SKILL.md` | How to confirm a change works instead of typechecking it |
| `code/skills/office-files/SKILL.md` | xlsx, docx, pptx and pdf, and the zip-and-XML fallback |
| `code/agents/explorer.md` | Read-only subagent that maps a subsystem and cites lines |
| `code/agents/reviewer.md` | Read-only subagent that reports defects by severity |
| `code/commands/title.md` | Two or three words for the session |
| `code/commands/compact.md` | A brief that can replace the history |

## Two languages, on purpose

`chat/system-prompt.md` and `chat/styles/` are in Spanish because they are
injected verbatim into the prompt of an app whose UI is in Spanish. Everything
else is in English: those files are read by the model as working guidance, not
executed by the app, and both surfaces already instruct the agent to answer in
whatever language the user writes in. So the user never sees this split.

## How these were written

Every tool name, file path, env var, glob and limit here was read out of this
repository rather than assumed. Where the code and the obvious thing to believe
disagreed, the code won: the sandbox has no `pip` and no `openpyxl` even though a
tool description suggests otherwise, this Next.js version is not the one in most
tutorials, and the coding agent can write Office files while the chat cannot.
Where a file makes a claim the repository does not support, the claim is not
there.
