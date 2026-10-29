import { lbState, login, openFolder } from './_helpers.mjs';

export default async (page, t) => {
  await page.viewport(390, 844, true);
  t.ok(await login(page, t), 'logowanie na telefonie');
  t.eq(await page.eval(`document.documentElement.scrollWidth`), 390, 'brak przewijania w poziomie');
  t.eq(await page.eval(`getComputedStyle(document.querySelector('.tiles')).gridTemplateColumns.split(' ').length`), 2, 'dwie kolumny kafelków');
  await page.shot('m01-home');

  await openFolder(page, 'Chorwacja');
  t.ok(await page.waitFor(`document.querySelector('.hero h1')?.textContent === '21 lipca 2023'`), 'folder Chorwacja');
  t.eq(await page.eval(`[...document.querySelectorAll('.tile-title')].map((n) => n.textContent)`), ['Dzień 2 — Split'], 'podfolder jako kafelek');
  t.ok(await page.waitFor(`document.querySelectorAll('.ph.loaded').length >= 4`, 20000), 'miniatury');
  await page.shot('m02-folder');

  await page.eval(`document.querySelectorAll('.ph')[0].click()`);
  await page.waitFor(`document.querySelector('.lb-frame')?.classList.contains('is-full')`);
  t.ok((await lbState(page)).count.startsWith('1 /'), 'podgląd 1. zdjęcia');
  await page.shot('m03-lightbox');

  await page.swipe(320, 400, 60, 410);
  t.ok(await page.waitFor(`document.querySelector('.lb-count').textContent.startsWith('2 /')`), 'przesunięcie w lewo = następne');
  await page.swipe(60, 400, 330, 395);
  t.ok(await page.waitFor(`document.querySelector('.lb-count').textContent.startsWith('1 /')`), 'przesunięcie w prawo = poprzednie');
  await page.waitFor(`document.querySelector('.lb-frame')?.classList.contains('is-full')`);

  await page.tap(195, 420);
  await page.sleep(80);
  await page.tap(195, 420);
  t.ok(await page.waitFor(`document.querySelector('.lb').classList.contains('is-zoomed')`), 'podwójne stuknięcie przybliża');
  await page.shot('m04-zoom');
  await page.tap(195, 420);
  await page.sleep(80);
  await page.tap(195, 420);
  t.ok(await page.waitFor(`!document.querySelector('.lb').classList.contains('is-zoomed')`), 'ponowne podwójne stuknięcie oddala');
  await page.sleep(400);

  await page.tap(195, 420);
  t.ok(await page.waitFor(`document.querySelector('.lb').classList.contains('chrome-hidden')`), 'stuknięcie chowa przyciski');
  await page.tap(195, 420);
  await page.sleep(500);

  await page.swipe(195, 300, 200, 560);
  t.ok(await page.waitFor(`document.querySelector('.lb').hidden`), 'przeciągnięcie w dół zamyka');
  t.ok(!(await lbState(page)).hash.includes('/p/'), 'adres wraca do folderu');
};
