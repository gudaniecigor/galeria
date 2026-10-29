import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login } from './_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default async (page, t) => {
  await page.viewport(1280, 800);
  await login(page, t);

  // Manifest i ikony
  const manifest = await page.eval(`fetch(document.querySelector('link[rel=manifest]').href).then((r) => r.json())`);
  t.eq([manifest.display, manifest.start_url, manifest.short_name], ['standalone', './', 'Galeria'], 'manifest aplikacji');
  const icons = await page.eval(`Promise.all(${JSON.stringify(manifest.icons.map((i) => i.src))}.map((src) => fetch(src).then((r) => r.ok)))`);
  t.ok(icons.every(Boolean), 'wszystkie ikony z manifestu istnieją');

  // Zapamiętanie strony w urządzeniu
  t.ok(await page.waitFor(`navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true)`), 'service worker zarejestrowany');
  await page.reload(1500);
  t.ok(await page.waitFor(`navigator.serviceWorker.controller`), 'strona obsługiwana przez service worker po odświeżeniu');
  const stored = await page.eval(`caches.open('galeria-strona-v1').then((c) => c.keys()).then((k) => k.map((r) => new URL(r.url).pathname))`);
  t.ok(['/', '/css/style.css', '/js/app.js', '/js/lightbox.js', '/fonts/inter-latin.woff2'].every((p) => stored.includes(p)), 'pliki strony zapamiętane w urządzeniu');
  t.ok(!stored.some((p) => p.startsWith('/dev/')), 'pliki testowe nie są zapamiętywane');
  t.ok(await page.waitFor(`document.querySelectorAll('a.tile').length > 5`), 'galeria działa z zapamiętanych plików');

  // Nowa wersja: zmiana pliku na serwerze → komunikat „Odśwież”
  const file = path.join(ROOT, 'css', 'style.css');
  const original = fs.readFileSync(file);
  try {
    fs.writeFileSync(file, Buffer.concat([original, Buffer.from('\n/* test nowej wersji */\n')]));
    await page.reload(1500);
    t.ok(await page.waitFor(`document.querySelector('.notice')?.textContent.includes('nowa wersja')`, 8000), 'po zmianie na serwerze pojawia się „Jest nowa wersja galerii”');
    await page.shot('10-update');
  } finally {
    fs.writeFileSync(file, original);
  }
  await page.clickSel('.notice .btn-primary');
  await page.sleep(1500);
  t.ok(!(await page.eval(`document.querySelector('.notice')`)), '„Odśwież” wczytuje nową wersję');

  // Przycisk instalacji (pokazywany, gdy przeglądarka pozwala zainstalować)
  await page.eval(`(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); })()`);
  t.ok(!(await page.eval(`document.querySelector('.topbar [aria-label="Zainstaluj jako aplikację"]').hidden`)), 'przycisk „Zainstaluj” pojawia się w pasku');
  await page.clickSel('.topbar [aria-label="Zainstaluj jako aplikację"]');
  await page.sleep(200);
  t.ok(await page.eval(`window.__prompted === true && document.querySelector('.topbar [aria-label="Zainstaluj jako aplikację"]').hidden`), 'kliknięcie otwiera instalację i chowa przycisk');
};
