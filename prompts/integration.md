# Integration

Everything below was checked against this repository, so the file paths and
function signatures are the real ones. Read the section for the surface you are
changing and skip the rest.

## Layout

```text
prompts/
  chat/
    system-prompt.md            drop-in rewrite of src/lib/ai/system.ts
    styles/                     four style presets for src/lib/styles.ts
    skills/                     five skills, written for progressive disclosure
  code/
    AGENTS.md                   global instructions for the coding agent in every pod
    skills/                     run-nexo, review, verify-change, office-files
    agents/                     explorer and reviewer subagents
    commands/                   title and compact
```

## Chat

### 1. The system prompt

`src/lib/ai/system.ts` builds the prompt in one function, `systemPrompt(input)`,
and pushes sections onto an array in a fixed order:

```ts
const sections = [BASE];
if (input.artifacts) sections.push(ARTIFACTS);
if (input.preferences.trim()) sections.push(...);
if (input.project) sections.push(...);
if (input.memories) sections.push(...);
if (input.style?.instructions.trim()) sections.push(...);
if (input.research) sections.push(RESEARCH);
```

The order is deliberate: what changes least goes first so the provider can cache
the prefix. Keep it.

To adopt the new prompt, take the text from `chat/system-prompt.md` and put each
block where the old constant was:

| From the file | Goes into |
| --- | --- |
| The BASE block | the `BASE` constant |
| The visual output block | the `ARTIFACTS` constant, still behind `input.artifacts` |
| The research block | the `RESEARCH` constant, still behind `input.research` |

Two things to preserve while you do it:

- The whole prompt must stay in Spanish if you keep the rest of the app in
  Spanish, because it instructs the model to answer in the user's language. The
  files in this pack are written in English on purpose: they are the source, and
  you translate once at integration time, in one place.
- The style section is inserted as `## Estilo de respuesta: <name>` followed by
  the style's `instructions`. The presets in `chat/styles/` are written to be
  pasted straight into that field.

### 2. The style presets

`src/lib/styles.ts` holds `PRESET_STYLES: StyleOption[]`, where

```ts
type StyleOption = { id: string; name: string; description: string; instructions: string; custom: boolean };
```

Add the two new ones after the existing entries:

| File | Id |
| --- | --- |
| `chat/styles/concise.md` | `concise`, already exists |
| `chat/styles/explanatory.md` | `explanatory`, already exists |
| `chat/styles/coach.md` | `coach`, new |
| `chat/styles/technical.md` | `technical`, new |

Keep `normal` with empty `instructions`, because an empty string is what makes
`systemPrompt` skip the style section entirely, and keep `formal`, because
users may already have stored a preference for that id. Deleting a preset id
leaves those preferences dangling.

### 3. The title prompt

`src/lib/ai/title.ts` has a private `PROMPT` constant and
`generateTitle()`, which takes the first 2000 characters of the first user
message and asks for a short title. Replace the text of `PROMPT` if you want the
new voice. Keep the rest of the function as it is: it already handles the
fallback when the provider returns nothing.

### 4. The chat skills

This is the part that needs a decision, because the chat has no skill loader
today. The model in the chat cannot read a file on its own, so a `SKILL.md` only
takes effect if something puts its text in front of the model. Three options, in
order of how little code they need:

1. **Fold the rules into `system.ts`.** The BASE block in
   `chat/system-prompt.md` already contains the rules that must always apply:
   when to build an artifact, what the runtime allows, when to use a widget, and
   the rules of the Python sandbox. That is the part worth paying tokens for on
   every request. The skill files are the long version of the same rules.
2. **Publish them as MCP prompt resources.** A server can expose one resource
   per skill, and the instructions tell the model to read the one it needs. This
   keeps the base prompt small and is the right shape if the skills grow.
3. **Add a `skill` tool.** A tool that returns the text of a named skill, with
   the name and description in its schema so the model can choose. Most work,
   most flexible.

The skills are written to work with option 2 or 3: each has a one-line
`description` that says when to use it, and the body is written to be read once
and applied for the rest of the task, not quoted.

## Nexo Code

The coding agent reads its configuration from the project directory and from the
user's global config directory. Both are scanned with these globs:

| Kind | Glob |
| --- | --- |
| Agent | `{agent,agents}/**/*.md` |
| Command | `{command,commands}/**/*.md` |
| Skill | `{skill,skills}/**/SKILL.md` |

### What ships in every workspace pod

`deploy/workspace/build.sh` builds the image with a second build context pointed
at `prompts/code/`, and the Dockerfile copies the generic pieces in:

| From | Into the image | How nexocode finds it |
| --- | --- | --- |
| `code/AGENTS.md` | `/usr/local/lib/nexo/AGENTS.md` | `instructions` in the config `workspaceConfig()` writes |
| `code/agents/explorer.md`, `reviewer.md` | `/usr/local/lib/nexo/nexocode/agents/` | `NEXOCODE_CONFIG_DIR` |
| `code/skills/office-files`, `review` | `/usr/local/lib/nexo/nexocode/skills/` | `NEXOCODE_CONFIG_DIR` |

`instructions` is added on top of the built-in prompt of whichever agent runs,
so it applies to both `build` and `plan` without replacing either. Check what
the pod sees with `nexocode debug skill` and `GET /agent` on its server.

`run-nexo` and `verify-change` describe this repository, not the user's, and
the commands would shadow built-ins, so those stay out of the pod. To use them
while working on Nexo itself, copy them into the repository:

```text
.nexocode/
  skills/
    run-nexo/SKILL.md
    verify-change/SKILL.md
  commands/
    title.md
    compact.md
```

### Agents

Frontmatter is optional except for `description`, and the name comes from the
file name. Supported fields are `description`, `mode`, `model`, `variant`,
`temperature`, `top_p`, `steps`, `color`, `permission`, `options`, `disable`,
`hidden`, and an inline `prompt`. The markdown body is the prompt.

- `code/agents/explorer.md` is a subagent with `write`, `edit`, `patch`,
  `apply_patch`, `multiedit` and `bash` set to `deny`. It searches and reports,
  and it cannot touch the repository.
- `code/agents/reviewer.md` is a subagent with every write permission denied.
- `color` must be a hex value or one of `primary`, `secondary`, `accent`,
  `success`, `warning`, `error` and `info`. Anything else makes the whole config
  invalid, and nexocode refuses to start.

### Skills

Each skill is a directory with a `SKILL.md` inside. The `name` in the frontmatter
must match the directory name, and the `description` is what the model reads to
decide whether to open it. That is the whole contract: a skill whose description
does not say when to use it will not be used.

### Commands

Frontmatter takes `description`, `agent` and `model`, all optional. In the body,
`$1`, `$2` and so on are the positional arguments and `$ARGUMENTS` is everything
the user typed after the command name. Both commands in this pack leave the
model unpinned, so they run on whatever the user has selected. Pin
`model:` in the frontmatter if you want them to run on a cheaper one, which is
worth doing for a title or a summary.

## Checking it works

Chat:

1. Start a conversation and ask for something that needs a panel: a small React
   component, a chart of five values, a diagram of three steps. The artifact or
   widget should appear with a preview, and the reply should be one sentence, not
   a copy of the code.
2. Attach a CSV and ask for the mean and a plot. The numbers in the reply must
   match what the run returned.
3. Switch the style to each new preset and confirm the section appears in the
   prompt and changes the tone without changing the tool behaviour.
4. Ask for an investigation and confirm the answer carries numbered sources that
   resolve.

Nexo Code:

1. Open the agent and ask what commands run the checks. The answer should come
   from the `run-nexo` skill.
2. Delegate a search with the explorer and check the git tree afterwards: it must
   be unchanged.
3. Make a change, then ask for a review and compare the findings with the
   `reviewer` format.
4. Ask for a spreadsheet and check that a file arrives through `present_files`
   rather than as text in the chat.
