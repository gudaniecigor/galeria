import { lbState, login, openFolder } from './_helpers.mjs';

const zoomLevel = (page) =>
  page.eval(`(() => { const m = document.querySelector('.lb-frame').style.transform.match(/scale\\(([\\d.]+)\\)/); return m ? Number(m[1]) : 1; })()`);

export default async (page, t) => {
  // --- komputer ---
  await page.viewport(1280, 800);
  await login(page, t);
  await openFolder(page, 'Mazury');
  await page.waitFor(`document.querySelectorAll('.ph.loaded').length >= 6`, 25000);
  await page.eval(`document.querySelectorAll('.ph')[0].click()`);
  t.ok(await page.waitFor(`document.querySelector('.lb-frame')?.classList.contains('is-full')`), 'podgląd otwarty');

  t.ok(await page.waitFor(`document.querySelector('.lb-ambient')?.classList.contains('ready')`), 'rozmyte tło z tego samego zdjęcia');
  const strip = await page.eval(`({
    count: document.querySelectorAll('.lb-thumb').length,
    photos: document.querySelectorAll('.ph').length,
    active: [...document.querySelectorAll('.lb-thumb')].findIndex((b) => b.classList.contains('active')),
  })`);
  t.ok(strip.count === strip.photos && strip.active === 0, `pasek miniatur (${strip.count}) z zaznaczonym bieżącym zdjęciem`);
  t.ok(await page.waitFor(`document.querySelectorAll('.lb-thumb.loaded').length >= 5`, 10000), 'miniatury w pasku się wczytują');
  await page.shot('07-lightbox-desktop');

  await page.eval(`document.querySelectorAll('.lb-thumb')[4].click()`);
  t.ok(await page.waitFor(`document.querySelector('.lb-count').textContent.startsWith('5 /')`), 'kliknięcie w pasek przechodzi do zdjęcia');
  t.ok(await page.waitFor(`document.querySelectorAll('.lb-thumb')[4].classList.contains('active')`), 'pasek zaznacza nowe zdjęcie');
  await page.waitFor(`document.querySelector('.lb-frame').classList.contains('is-full')`);

  const box = await page.eval(`(() => { const r = document.querySelector('.lb-frame').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await page.wheel(box[0], box[1], -400);
  await page.sleep(200);
  t.ok((await zoomLevel(page)) > 1.5 && (await lbState(page)).zoomed, 'kółko myszy przybliża');
  await page.wheel(box[0], box[1], 1200);
  await page.sleep(200);
  t.ok(!(await lbState(page)).zoomed, 'kółko myszy oddala do normalnego widoku');

  await page.key('+');
  await page.sleep(100);
  t.ok((await lbState(page)).zoomed, 'klawisz + przybliża');
  await page.key('Escape');
  await page.sleep(100);
  let state = await lbState(page);
  t.ok(state.open && !state.zoomed, 'Escape najpierw oddala');
  await page.key('Escape');
  t.ok(await page.waitFor(`document.querySelector('.lb').hidden`), 'drugi Escape zamyka');

  // --- telefon ---
  await page.viewport(390, 844, true);
  await page.reload(800);
  await page.waitFor(`document.querySelectorAll('.ph.loaded').length >= 4`, 20000);
  await page.eval(`document.querySelectorAll('.ph')[1].click()`);
  await page.waitFor(`document.querySelector('.lb-frame')?.classList.contains('is-full')`);
  t.ok(!(await page.eval(`document.querySelector('.lb').classList.contains('has-strip')`)), 'bez paska miniatur na telefonie');
  t.eq(await page.eval(`document.querySelector('.lb-actions .icon-btn').getBoundingClientRect().width`), 48, 'większe przyciski na telefonie');

  await page.pinch(195, 420, 80, 260);
  await page.sleep(200);
  const pinched = await zoomLevel(page);
  t.ok((await lbState(page)).zoomed && pinched > 2.5, `rozsunięcie dwóch palców przybliża (×${pinched.toFixed(1)})`);
  await page.shot('07-pinch');
  await page.pinch(195, 420, 260, 70);
  await page.sleep(300);
  t.ok(!(await lbState(page)).zoomed, 'zsunięcie palców wraca do normalnego widoku');
  state = await lbState(page);
  t.ok(state.open && state.count.startsWith('2 /'), 'gesty dwoma palcami nie zmieniają zdjęcia');
};
