import { lbState, login, openFolder } from './_helpers.mjs';

export default async (page, t) => {
  await page.viewport(1280, 800);

  // Wygaśnięcie sesji: token ważny 5 s
  await login(page, t, '?expires=65');
  await page.sleep(5500);
  await openFolder(page, 'Mazury');
  t.ok(await page.waitFor(`document.querySelector('.modal h2')?.textContent === 'Sesja wygasła'`), 'po wygaśnięciu pojawia się okno „Sesja wygasła”');
  await page.clickSel('.modal .btn-primary');
  t.ok(await page.waitFor(`!document.querySelector('.modal') && document.querySelector('.hero h1')?.textContent === '1 sierpnia 2024'`), '„Kontynuuj” odnawia sesję i otwiera folder');
  const reauth = await page.eval(`JSON.parse(window.__mockLog.filter((l) => l[0] === 'requestAccessToken').at(-1)[1])`);
  t.eq(reauth, { prompt: '', login_hint: 'igor@example.com' }, 'odnowienie bez wybierania konta');

  // Adresy spoza galerii
  await page.eval(`location.hash = '#/f/MYDRIVE_root_000'`);
  t.ok(await page.waitFor(`document.querySelector('.state-card')?.textContent.includes('nie należy do galerii')`), 'folder spoza galerii jest blokowany');
  await page.eval(`location.hash = '#/f/IMG_00000030x'`);
  t.ok(await page.waitFor(`document.querySelector('.state-card')?.textContent.includes('nie należy do galerii')`), 'plik zamiast folderu jest blokowany');
  await page.eval(`location.hash = '#/f/abc%22)%20or%20(1'`);
  t.ok(await page.waitFor(`document.querySelector('.hero h1')?.textContent === 'Nasze zdjęcia'`), 'nieprawidłowy adres prowadzi do galerii');

  // Nazwa folderu z kodem HTML
  await page.eval(`window.scrollTo(0, 99999)`);
  await page.sleep(800);
  const xss = await page.eval(`({
    injected: document.querySelectorAll('img[src="x"]').length,
    title: [...document.querySelectorAll('.tile-title')].map((n) => n.textContent).find((s) => s.includes('onerror')),
  })`);
  t.eq(xss.injected, 0, 'kod HTML z nazwy folderu nie jest wykonywany');
  t.ok(xss.title?.startsWith('<img'), 'nazwa folderu wyświetla się jako zwykły tekst');

  // Wylogowanie
  await page.clickSel('.topbar .icon-btn[aria-label="Wyloguj"]');
  t.ok(await page.waitFor(`document.querySelector('.login')`), 'wylogowanie pokazuje ekran logowania');
  t.eq(await page.eval(`location.hash`), '', 'wylogowanie czyści adres');

  // Konto bez dostępu
  await page.eval(`localStorage.clear(); sessionStorage.clear()`);
  await login(page, t, '?noaccess');
  t.ok(await page.waitFor(`document.querySelector('.state-card h1')?.textContent === 'Brak dostępu'`), 'konto bez dostępu widzi „Brak dostępu”');

  // Miniatury Google działające bez logowania
  await page.eval(`localStorage.clear(); sessionStorage.clear(); caches.keys().then((k) => Promise.all(k.map((n) => caches.delete(n))))`);
  await login(page, t, '?links');
  await page.waitFor(`document.querySelectorAll('.tile.loaded').length >= 4`, 15000);
  const links = await page.eval(`({ thumbs: __mockLog.filter((l) => l[0] === 'thumb').length, media: __mockLog.filter((l) => l[0] === 'media').length })`);
  t.ok(links.thumbs >= 4 && links.media === 0, 'gdy miniatury Google działają, pełne zdjęcia nie są pobierane');
  t.ok(!(await lbState(page)).open, 'podgląd zamknięty');
};
