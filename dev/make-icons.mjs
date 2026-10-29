// Generuje ikony aplikacji (PNG) z logo — w przeglądarce bez okna.
//   node dev/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');

// Symbol zdjęcia (ramka, góry, słońce) na siatce 64×64 — ten sam co w icon.svg.
const glyph = `
  <rect x="14" y="16" width="36" height="32" rx="5" fill="none" stroke="#e8b56d" stroke-width="3.5"/>
  <path d="M16 44l10-10 8 8 5-5 9 9" fill="none" stroke="#e8b56d" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="39" cy="26" r="3.5" fill="#e8b56d"/>`;

const ICONS = [
  // [plik, rozmiar, zaokrąglone tło?, skala symbolu]
  ['icon-192.png', 192, true, 1],
  ['icon-512.png', 512, true, 1],
  ['maskable-512.png', 512, false, 0.78], // Android sam przycina kształt — symbol w bezpiecznej strefie
  ['apple-touch-icon.png', 180, false, 0.9], // iPhone sam zaokrągla rogi
];

function svg(size, rounded, scale) {
  const offset = 32 - 32 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
    <rect width="64" height="64" rx="${rounded ? 16 : 0}" fill="#1a1a1e"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${glyph}</g>
  </svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
const page = await launch({ port: 9334 });
await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [file, size, rounded, scale] of ICONS) {
  await page.viewport(size, size);
  const html = `<html><body style="margin:0;background:transparent">${svg(size, rounded, scale)}</body></html>`;
  await page.goto(`data:text/html;base64,${Buffer.from(html).toString('base64')}`, 300);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
  console.log(`icons/${file}`);
}
await page.close();
