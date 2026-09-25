---
name: diagramming
description: Draw diagrams, flows and architecture pictures with Mermaid, the diagram widget or inline SVG. Use when a relationship or a flow is the thing being explained.
---

# Diagramming

A diagram earns its place when the text would be a list of arrows spelled out.
If the answer is a linear list of steps, write the list.

## Pick the tool

| What the diagram is | Use |
| --- | --- |
| Flowchart, sequence, class or state diagram, ER, gantt, mindmap | `artifact` with `type: "mermaid"` |
| A small graph of named nodes and arrows, no layout control | `show_widget` with `type: "diagram"` |
| A precise figure with exact positions, icons or custom geometry | `artifact` with `type: "svg"` |
| An architecture picture with styling and links | `artifact` with `type: "html"` |

## Mermaid

The renderer is Mermaid 11 with `securityLevel: "strict"`. Clicks, scripts and
custom HTML inside nodes do not run, so keep to shapes, text and arrows.

```
flowchart TD
  user["User"] --> chat["Chat"]
  chat --> model["Model provider"]
  chat --> tools["Built-in tools"]
  tools --> sandbox["Python sandbox"]
  tools --> mcp["MCP connectors"]
```

- `flowchart TD` or `LR`. Pick the direction that matches the sentence you would
  use: top to bottom for a pipeline, left to right for a sequence.
- Quote every label that contains spaces or punctuation: `A["Sign in"]`, not
  `A[Sign in]`.
- Keep labels under about 30 characters. Long ones get truncated or the layout
  collapses.
- Style sparingly with `classDef` when grouping matters. The theme is already
  chosen by the app, so do not fight it with hardcoded colors.
- One diagram per artifact. If a system needs three, make three artifacts with
  stable identifiers so the user can flip between them.

## The diagram widget

Good for a plain graph, and it is validated strictly:

```json
{
  "type": "diagram",
  "title": "Request path",
  "nodes": [
    { "id": "web", "label": "Browser" },
    { "id": "api", "label": "Nexo API", "tone": "blue" },
    { "id": "db", "label": "Postgres", "tone": "green" }
  ],
  "edges": [
    { "from": "web", "to": "api" },
    { "from": "api", "to": "db" }
  ]
}
```

- Between 2 and 16 nodes, up to 30 edges, labels capped at 40 characters.
- Every edge must point to a `node.id` that exists, otherwise the call is
  rejected. Write the node list first and reuse those ids verbatim.
- `detail` adds a second line under the label, and `tone` is one of `neutral`,
  `blue`, `purple`, `green`, `orange`. Use tone for a real category such as
  storage or external service, not to make it look nicer.
- Layout is automatic, so use it when the shape does not carry meaning. When
  position matters, use Mermaid or SVG instead.

## Inline SVG

- Always set a `viewBox` and let width be 100%, so it scales with the panel.
- `xmlns="http://www.w3.org/2000/svg"` is required if you write a bare `<svg>`
  as the whole artifact.
- Use `currentColor` and CSS variables for strokes and text, with a
  `prefers-color-scheme` block, so it stays legible in both themes.
- Minimum font size 11 for labels. Compute coordinates, do not eyeball them:
  derive them in your head with a simple spacing rule, such as rows 48 apart
  and columns 160 apart, and keep the viewBox tight around the drawing.
- Use markers for arrowheads and `marker-end` on the paths, and leave room in
  the viewBox so heads are not clipped.

## Rules that apply to all of them

- Title every diagram. An untitled diagram makes the user guess what they are
  looking at.
- Label the edges that matter: `-->|"HTTPS"|`. Leave the rest plain.
- Do not redraw what the user already knows. A diagram of "frontend talks to
  backend" teaches nothing.
- Say in one sentence what the reader should take from the picture, right after
  the artifact call.
