import { lbState, login, openFolder } from './_helpers.mjs';

export default async (page, t) => {
  await page.viewport(1280, 800);
  await page.goto(t.base, 800);
  t.ok(await page.waitFor(`document.querySelector('.login-card h1')?.textContent === 'Galeria'`), 'ekran logowania');
  await page.shot('01-login');

  t.ok(await login(page, t), 'po zalogowaniu widać kafelki');
  const home = await page.eval(`({
    groups: [...document.querySelectorAll('.group:not(.memories) .group-head h2')].map((n) => n.textContent),
    user: document.querySelector('.user-name')?.textContent,
  })`);
  t.eq(home.groups, ['2025', '2024', '2023', 'Bez daty'], 'lata od najnowszego, „Bez daty” na końcu');
  t.eq(home.user, 'Igor Testowy', 'nazwa użytkownika w pasku');
  t.ok(await page.waitFor(`document.querySelectorAll('.tile.loaded').length >= 4`, 15000), 'okładki kafelków się wczytują');
  await page.shot('02-home');

  await openFolder(page, 'Wakacje nad morzem');
  t.ok(await page.waitFor(`document.querySelector('.hero h1')?.textContent === '14 sierpnia 2025'`), 'nagłówek folderu z datą');
  t.ok(await page.waitFor(`document.querySelectorAll('.ph.loaded').length >= 8`, 20000), 'miniatury w siatce się wczytują');
  const grid = await page.eval(`({ eyebrow: document.querySelector('.eyebrow').textContent, height: parseFloat(document.querySelector('.justified').style.height) })`);
  t.eq(grid.eyebrow, 'Czwartek', 'dzień tygodnia nad datą');
  t.ok(grid.height > 500, 'siatka ma ułożoną wysokość');
  await page.shot('03-folder');

  await page.eval(`document.querySelectorAll('.ph')[1].click()`);
  t.ok(await page.waitFor(`document.querySelector('.lb-frame')?.classList.contains('is-full')`), 'podgląd wczytuje pełne zdjęcie');
  let lb = await lbState(page);
  t.ok(lb.open && lb.count.startsWith('2 /'), 'podgląd otwarty na 2. zdjęciu');
  t.ok(/\/p\/IMG_/.test(lb.hash), 'adres zawiera zdjęcie');
  await page.shot('04-lightbox');

  await page.key('ArrowRight');
  t.ok(await page.waitFor(`document.querySelector('.lb-count').textContent.startsWith('3 /')`), 'strzałka w prawo = następne zdjęcie');
  await page.key('Escape');
  await page.waitFor(`document.querySelector('.lb').hidden`);
  lb = await lbState(page);
  t.ok(!lb.open && !lb.hash.includes('/p/'), 'Escape zamyka podgląd i wraca do folderu');
  t.ok(!(await page.eval(`document.documentElement.classList.contains('lb-open')`)), 'przewijanie strony odblokowane');

  await page.clickSel('.topbar .back');
  t.ok(await page.waitFor(`location.hash === '' || location.hash === '#/'`), 'przycisk wstecz wraca do galerii');
  t.ok(await page.eval(`document.querySelector('.topbar .back').hidden`), 'na stronie głównej brak przycisku wstecz');
};
