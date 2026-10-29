import { login, openFolder } from './_helpers.mjs';

const media = (page) => page.eval(`__mockLog.filter((l) => l[0] === 'media').map((l) => l[1])`);

export default async (page, t) => {
  await page.viewport(1280, 800);
  await login(page, t);

  const listQuery = await page.eval(`new URLSearchParams(__mockLog.find((l) => l[0] === 'api' && l[1].startsWith('/files?'))[1].split('?')[1]).get('q')`);
  t.ok(listQuery.includes(`mimeType = 'image/jpeg'`) && !listQuery.includes(`contains 'image/'`), 'tylko formaty możliwe do wyświetlenia (RAW pomijane)');

  t.ok(await page.waitFor(`__mockLog.filter((l) => l[0] === 'api' && l[1].startsWith('/files?')).length >= 24`, 15000), 'listy wszystkich folderów pobierane w tle');

  await openFolder(page, 'Wakacje nad morzem');
  t.ok(await page.waitFor(`document.querySelectorAll('.ph.loaded').length >= 10`, 25000), 'miniatury w siatce');
  t.ok(await page.eval(`performance.getEntriesByType('resource').some((r) => r.name.endsWith('resize-worker.js'))`), 'zdjęcia zmniejszane w osobnym wątku');
  t.ok(await page.waitFor(`caches.open('galeria-podglady-v1').then((c) => c.keys()).then((k) => k.length >= 10)`, 10000), 'duże podglądy zapamiętane przy okazji miniatur');

  // Zdjęcie z gotową miniaturą otwiera się z pamięci, bez ponownego pobierania
  const loadedIndex = await page.eval(`[...document.querySelectorAll('.ph')].findIndex((n) => n.classList.contains('loaded'))`);
  const before = (await media(page)).length;
  await page.eval(`document.querySelectorAll('.ph')[${loadedIndex}].click()`);
  t.ok(await page.waitFor(`document.querySelector('.lb-frame')?.classList.contains('is-full')`, 5000), 'podgląd otwarty');
  const fromCache = await page.eval(`({ w: document.querySelector('.lb-full').naturalWidth, src: document.querySelector('.lb-full').src.slice(0, 5) })`);
  t.ok(fromCache.src === 'blob:' && fromCache.w <= 2048, `podgląd z zapamiętanej kopii (${fromCache.w}px)`);
  await page.sleep(500);
  const opened = (await media(page)).slice(before);
  const current = await page.eval(`location.hash.split('/p/')[1]`);
  t.ok(!opened.includes(current), 'otwarcie zdjęcia nie pobiera ponownie oryginału');

  // Przybliżenie podmienia podgląd na oryginał
  await page.eval(`(() => { const r = document.querySelector('.lb-full').getBoundingClientRect(); window.__c = [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  const [cx, cy] = await page.eval(`window.__c`);
  await page.click(cx, cy);
  await page.sleep(60);
  await page.click(cx, cy);
  t.ok(await page.waitFor(`document.querySelector('.lb').classList.contains('is-zoomed')`), 'dwuklik przybliża');
  t.ok(await page.waitFor(`document.querySelector('.lb-full').naturalWidth > 2048`, 8000), 'przy przybliżeniu wczytuje się oryginał');

  // Pobranie korzysta z już pobranego oryginału
  const countCurrent = async () => (await media(page)).filter((id) => id === current).length;
  const beforeDownload = await countCurrent();
  await page.clickSel('.lb-actions .icon-btn[aria-label="Pobierz oryginał"]');
  await page.sleep(800);
  t.eq(await countCurrent(), beforeDownload, 'pobieranie oryginału bez ponownego ściągania pliku');
  await page.shot('06-lightbox');
};
