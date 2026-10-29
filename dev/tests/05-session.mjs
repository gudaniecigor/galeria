import { login } from './_helpers.mjs';

const lastTokenRequest = (page) =>
  page.eval(`JSON.parse(__mockLog.filter((l) => l[0] === 'requestAccessToken').at(-1)?.[1] ?? 'null')`);

export default async (page, t) => {
  await page.viewport(1280, 800);
  t.ok(await login(page, t), 'pierwsze logowanie');
  t.eq(await lastTokenRequest(page), { prompt: 'select_account' }, 'za pierwszym razem Google pyta o konto');
  t.ok(await page.waitFor(`document.querySelectorAll('a.tile.loaded').length >= 4`, 20000), 'okładki wczytane');

  const stored = await page.eval(`JSON.parse(localStorage.getItem('galeria.session'))`);
  t.ok(stored?.token && stored.user?.email === 'igor@example.com', 'sesja zapisana w localStorage (przeżyje zamknięcie karty)');

  // Czcionki z repozytorium, nie z Google Fonts
  const fonts = await page.eval(`({
    google: performance.getEntriesByType('resource').some((r) => r.name.includes('fonts.g')),
    fraunces: document.fonts.check('500 20px Fraunces', 'ąę'),
    inter: document.fonts.check('16px Inter', 'ąę'),
  })`);
  t.ok(!fonts.google, 'brak zapytań do Google Fonts');
  t.ok(fonts.fraunces && fonts.inter, 'czcionki Fraunces i Inter z polskimi znakami wczytane');

  // Wylogowanie: zapamiętane konto i miniatury zostają
  await page.sleep(1500);
  const fetchedBefore = await page.eval(`__mockLog.filter((l) => l[0] === 'media').map((l) => l[1])`);
  await page.clickSel('.topbar .icon-btn[aria-label="Wyloguj"]');
  await page.waitFor(`document.querySelector('.login')`);
  t.eq(await page.eval(`document.querySelector('.login-account span')?.textContent`), 'igor@example.com', 'ekran logowania pokazuje zapamiętane konto');
  t.ok(await page.eval(`caches.has('galeria-miniatury-v1')`), 'miniatury zostają po wylogowaniu');

  await page.eval(`__mockLog.length = 0`);
  await page.waitFor(`!document.querySelector('.gbtn').disabled`);
  await page.clickSel('.gbtn');
  t.ok(await page.waitFor(`document.querySelectorAll('a.tile').length > 5`), 'ponowne logowanie jednym kliknięciem');
  t.eq(await lastTokenRequest(page), { prompt: '', login_hint: 'igor@example.com' }, 'bez wybierania konta');
  t.ok(await page.waitFor(`document.querySelectorAll('a.tile.loaded').length >= 4`, 10000), 'okładki po ponownym logowaniu');
  const refetched = await page.eval(`__mockLog.filter((l) => l[0] === 'media' && ${JSON.stringify(fetchedBefore)}.includes(l[1])).length`);
  t.ok(fetchedBefore.length >= 4 && refetched === 0, `okładki z pamięci — bez ponownego pobierania (${fetchedBefore.length} zapamiętanych)`);

  // Zmiana konta
  await page.clickSel('.topbar .icon-btn[aria-label="Wyloguj"]');
  await page.waitFor(`document.querySelector('.login-account .link-btn') && !document.querySelector('.login-account .link-btn').disabled`);
  await page.eval(`document.querySelector('.login-account .link-btn').click()`);
  await page.waitFor(`document.querySelectorAll('a.tile').length > 5`);
  t.eq(await lastTokenRequest(page), { prompt: 'select_account' }, '„Zmień konto” otwiera wybór konta');

  // Konto bez dostępu → „Zaloguj się innym kontem” zapomina konto
  await page.eval(`localStorage.removeItem('galeria.session')`);
  await page.goto(`${t.base}?noaccess`, 600);
  await page.waitFor(`!document.querySelector('.gbtn').disabled`);
  await page.clickSel('.gbtn');
  await page.waitFor(`document.querySelector('.state-card h1')?.textContent === 'Brak dostępu'`);
  await page.clickSel('.state-card .btn');
  await page.waitFor(`document.querySelector('.login')`);
  t.ok(!(await page.eval(`document.querySelector('.login-account')`)), 'po „Zaloguj się innym kontem” konto jest zapomniane');
};
