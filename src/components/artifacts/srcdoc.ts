import type { ArtifactVersion } from "./artifacts";

function inlineJson(value: string) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ERROR_UI = `
<style>
  #nexo-error{display:none;position:fixed;inset:auto 12px 12px 12px;padding:12px 14px;border:1px solid #d33;background:#fff5f5;color:#8a1111;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;z-index:99999;max-height:40vh;overflow:auto}
</style>
<div id="nexo-error"></div>
<script>
  window.__nexoError = function (err) {
    var box = document.getElementById("nexo-error");
    if (!box) return;
    box.style.display = "block";
    box.textContent = "Error: " + (err && (err.stack || err.message) || String(err));
  };
  window.addEventListener("error", function (e) { window.__nexoError(e.error || e.message); });
  window.addEventListener("unhandledrejection", function (e) { window.__nexoError(e.reason); });
</script>`;

function page(head: string, body: string, dark: boolean) {
  return `<!doctype html>
<html lang="es" style="color-scheme:${dark ? "dark" : "light"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
${ERROR_UI}
${body}
</body>
</html>`;
}

function reactDoc(source: string, dark: boolean) {
  const importMap = {
    imports: {
      react: "https://esm.sh/react@19",
      "react/": "https://esm.sh/react@19/",
      "react-dom": "https://esm.sh/react-dom@19",
      "react-dom/": "https://esm.sh/react-dom@19/",
    },
  };
  const head = `
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"></script>
<script type="importmap">${JSON.stringify(importMap)}</script>
<style>html,body{margin:0;min-height:100%;background:${dark ? "#0c0e11" : "#fff"};color:${dark ? "#e4e7eb" : "#0d1015"};font-family:system-ui,sans-serif}</style>`;
  const body = `
<div id="root"></div>
<script type="module">
  const source = ${inlineJson(source)};
  try {
    const { code } = Babel.transform(source, {
      filename: "App.tsx",
      presets: [["react", { runtime: "automatic" }], ["typescript", { isTSX: true, allExtensions: true }]],
    });
    const rewritten = code.replace(/(\\bfrom\\s*|\\bimport\\s*\\(?\\s*)(["'])([^"'.\\/][^"']*)\\2/g, (match, pre, quote, spec) =>
      /^(react|react-dom)(\\/|$)/.test(spec) ? match : pre + quote + "https://esm.sh/" + spec + "?external=react,react-dom" + quote,
    );
    const url = URL.createObjectURL(new Blob([rewritten], { type: "text/javascript" }));
    const mod = await import(url);
    const { createRoot } = await import("react-dom/client");
    const { createElement } = await import("react");
    const App = mod.default ?? Object.values(mod).find((v) => typeof v === "function");
    if (!App) throw new Error("El componente no tiene export default");
    createRoot(document.getElementById("root")).render(createElement(App));
  } catch (err) {
    window.__nexoError(err);
  }
</script>`;
  return page(head, body, dark);
}

function mermaidDoc(source: string, dark: boolean) {
  const head = `<style>html,body{margin:0;min-height:100%;background:${dark ? "#0c0e11" : "#fff"}}body{display:grid;place-items:center;padding:24px;box-sizing:border-box}</style>`;
  const body = `
<pre class="mermaid">${escapeHtml(source)}</pre>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: false, theme: ${dark ? '"dark"' : '"default"'}, securityLevel: "strict" });
  mermaid.run().catch((err) => window.__nexoError(err));
</script>`;
  return page(head, body, dark);
}

function svgDoc(source: string, dark: boolean) {
  const head = `<style>html,body{margin:0;height:100%;background:${dark ? "#0c0e11" : "#fff"}}body{display:grid;place-items:center;padding:16px;box-sizing:border-box}svg{max-width:100%;max-height:100%;height:auto}</style>`;
  return page(head, source, dark);
}

function htmlDoc(source: string, dark: boolean) {
  if (/<html[\s>]/i.test(source)) {
    return source.replace(/<body([^>]*)>/i, `<body$1>${ERROR_UI}`);
  }
  return page(`<style>body{font-family:system-ui,sans-serif}</style>`, source, dark);
}

/**
 * Arma el documento HTML que se carga en el iframe aislado según el tipo de
 * artifact. Markdown y código se pintan fuera del iframe.
 */
export function buildSrcDoc(artifact: ArtifactVersion, dark: boolean) {
  if (artifact.type === "react") return reactDoc(artifact.content, dark);
  if (artifact.type === "mermaid") return mermaidDoc(artifact.content, dark);
  if (artifact.type === "svg") return svgDoc(artifact.content, dark);
  return htmlDoc(artifact.content, dark);
}
