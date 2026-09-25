---
name: artifact-craft
description: Build artifacts that render correctly in the Nexo panel instead of failing on the first try. Use when creating or revising an artifact of type react, html, svg or mermaid.
requires: artifacts
---

# Building artifacts

An artifact is a single self-contained file rendered in a sandboxed iframe. The
runtime is small and specific, and most broken previews come from expecting
something it does not do.

## The runtime

| Type | How it runs |
| --- | --- |
| `react` | Babel compiles it in the browser, then it is mounted with React 19 |
| `html` | Loaded as a document; if the source has no `<html>`, it is wrapped |
| `mermaid` | Mermaid 11, theme chosen by the app, `securityLevel: "strict"` |
| `svg` | Injected as-is into the page |
| `markdown`, `code` | Rendered outside the iframe with the app's own highlighter |

## React

- One file. Relative imports to your own files do not resolve, so a component
  that needs a second module has to be one file or an inline string.
- TypeScript and JSX are fine, including interfaces and type annotations.
- `export default` is required. A named export alone renders an error.
- No required props. The component mounts with no props at all.
- `react` and `react-dom` are mapped to React 19 already. Import them bare.
- Any other bare import is rewritten to esm.sh, so `lucide-react`,
  `recharts`, `d3` and friends work. Import a subpath exactly as the package
  exports it.
- Tailwind v4 utility classes are available in the page. Custom CSS goes in a
  `<style>` element inside the component, or in a `style` prop.
- Hooks work. So does `useEffect` with data fetching to a third-party URL that
  allows CORS.

```tsx
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { month: "Jan", revenue: 12400 },
  { month: "Feb", revenue: 15800 },
];

export default function Revenue() {
  const [currency, setCurrency] = useState("EUR");
  return (
    <div className="p-6">
      <button onClick={() => setCurrency(currency === "EUR" ? "USD" : "EUR")}>{currency}</button>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="month" />
            <YAxis />
            <Line dataKey="revenue" stroke="#3b82f6" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

## HTML

- Send a full document with `<html lang="...">`, `<head>` and inline `<style>`
  when the page is more than a snippet.
- Scripts are allowed. Load libraries from a CDN with a `<script>` tag.
- If the source omits `<html>`, the app injects a minimal shell, so a bare
  fragment still works.

## Dark mode

The app sets `color-scheme` on the document, injects its own background and text
color, and rebuilds the whole document when the theme changes. So:

- Do not hardcode a background. Inherit it, or set your own and let
  `prefers-color-scheme` pick, which matches because `color-scheme` is set on the
  root element.
- Prefer `currentColor` for strokes and labels so they follow the injected text
  color instead of fighting it.
- Hardcoded hex colors survive the theme switch, and that is how a preview ends
  up with black text on a dark background.

```html
<style>
  :root { --bg: #ffffff; --fg: #0d1015; --line: #e4e7eb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0c0e11; --fg: #e4e7eb; --line: #2a2f36; }
  }
  body { background: var(--bg); color: var(--fg); }
</style>
```

The sandbox attribute is `allow-scripts allow-modals allow-forms allow-popups
allow-downloads`, with no `allow-same-origin`. Downloads and popups therefore
work, and storage, cookies and any call back into the app do not.

## SVG

- Always include a `viewBox` so it scales, and use `width="100%"` or no width
  at all.
- Style with `fill="currentColor"` and CSS variables rather than fixed hex
  colors, so it follows the theme.
- Label text with real `<text>` elements and a font size of at least 11.

## What not to do

- No secrets, API keys or private URLs in the artifact: the user can read the
  source, and artifacts can be shared.
- Do not fetch the app's own origin. The iframe has no same-origin access, so
  cookies, local storage and app APIs are unavailable by design.
- Do not use `allow-top-navigation` tricks or `window.top`. They are blocked.
- Do not print the artifact's contents in the chat afterwards. One sentence
  about what changed is enough.

## Revising

Reuse the same `identifier` and send the whole file again. Partial updates are
not applied, and inventing a new identifier leaves the old artifact behind as a
separate card.
