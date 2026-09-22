import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const brand = JSON.parse(await readFile(new URL("../src/components/brand/brand.json", import.meta.url), "utf8"));
const { colors: c } = brand;
const root = new URL("../", import.meta.url);
const out = (path) => new URL(path, root);

const stroke = (ink, width = 2.4) => `stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
const nodes = (fill, r = 2.2) => brand.nodes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join("");

const mark = (ink, node) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="${brand.mark}" ${stroke(ink)}/>${nodes(node)}</svg>`;

const logo = (ink, node, code = false) => {
  const w = code ? 116 : 72;
  const sub = code
    ? `<text x="75" y="18.6" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12.5" font-weight="500" fill="${node}">code</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 24" fill="none"><g ${stroke(ink)}><path d="${brand.mark}"/><path d="${brand.word}"/><circle cx="${brand.wordO.cx}" cy="${brand.wordO.cy}" r="${brand.wordO.r}"/></g>${nodes(node)}${sub}</svg>`;
};

const appIcon = (bleed = false) => {
  const bg = bleed ? `<rect width="24" height="24" fill="${c.blue}"/>` : `<rect width="24" height="24" rx="5.5" fill="${c.blue}"/>`;
  const s = bleed ? 0.62 : 0.74;
  const t = (24 - 24 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${bg}<g transform="translate(${t} ${t}) scale(${s})"><path d="${brand.mark}" fill="none" ${stroke("#ffffff", 2.9)}/>${nodes("#ffffff", 2.6)}</g></svg>`;
};

const og = () => `<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:${c.night};display:flex;flex-direction:column;justify-content:center;padding:0 110px;box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:${c.paper}">
<div style="height:96px">${logo(c.paper, c.blueDark).replace("<svg ", '<svg height="96" ')}</div>
<p style="margin:48px 0 0;font-size:44px;line-height:1.25;max-width:900px;letter-spacing:-0.01em">Chat con IA para cualquier modelo: Claude, GPT y los que traigas tú.</p>
<p style="margin:22px 0 0;font-size:26px;color:#8a8883">Tools MCP · artifacts · proyectos · Nexo Code</p>
<div style="position:absolute;right:-120px;bottom:-160px;width:560px;height:560px;opacity:.07">${mark(c.paper, c.paper)}</div>
</body></html>`;

await mkdir(out("public/brand/"), { recursive: true });
await mkdir(out("public/icons/"), { recursive: true });

const files = {
  "public/brand/nexo-mark-dark.svg": mark(c.paper, c.blueDark),
  "public/brand/nexo-mark-light.svg": mark(c.ink, c.blueLight),
  "public/brand/nexo-logo-dark.svg": logo(c.paper, c.blueDark),
  "public/brand/nexo-logo-light.svg": logo(c.ink, c.blueLight),
  "public/brand/nexo-code-logo-dark.svg": logo(c.paper, c.blueDark, true),
  "public/brand/nexo-code-logo-light.svg": logo(c.ink, c.blueLight, true),
  "public/brand/nexo-app-icon.svg": appIcon(),
  "src/app/icon.svg": appIcon(),
};
for (const [path, svg] of Object.entries(files)) await writeFile(out(path), `${svg}\n`);

const browser = await chromium.launch();
const page = await browser.newPage();
const png = async (html, width, height, path) => {
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  await page.screenshot({ path: out(path).pathname, omitBackground: true });
};
const square = (svg, size) =>
  `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`;

await png(square(appIcon(true), 180), 180, 180, "src/app/apple-icon.png");
await png(square(appIcon(), 192), 192, 192, "public/icons/icon-192.png");
await png(square(appIcon(), 512), 512, 512, "public/icons/icon-512.png");
await png(square(appIcon(true), 512), 512, 512, "public/icons/icon-maskable-512.png");
await png(og(), 1200, 630, "src/app/opengraph-image.png");
await browser.close();

console.log(`Listo: ${Object.keys(files).length} SVG y 5 PNG`);
