import { login, openFolder } from './_helpers.mjs';

const visibleTitles = (page) =>
  page.eval(`[...document.querySelectorAll('.group:not(.memories) a.tile')].filter((t) => !t.hidden && t.offsetParent).map((t) => t.querySelector('.tile-title').textContent)`);

const search = async (page, text) => {
  await page.eval(`(() => { const i = document.querySelector('.search'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input')); })()`);
  await page.sleep(100);
};

export default async (page, t) => {
  await page.viewport(1280, 800);
  await login(page, t);

  const home = await page.eval(`({
    chips: [...document.querySelectorAll('.chip')].map((c) => c.textContent),
    memories: [...document.querySelectorAll('.memories .tile-sub')].map((n) => n.textContent.split(' · ')[0]),
  })`);
  t.eq(home.chips, ['2025', '2024', '2023', 'Bez daty'], 'pasek z latami');
  t.eq(home.memories, ['Rok temu', '3 lata temu'], '„Wspomnienia” — te dni w poprzednich latach');
  t.ok(await page.waitFor(`document.querySelector('.hero-root.has-cover')`, 15000), 'nagłówek strony głównej z rozmytym zdjęciem');
  await page.waitFor(`document.querySelectorAll('a.tile.loaded').length >= 6`, 20000);
  t.ok(!(await page.eval(`document.querySelector('.toolbar').classList.contains('stuck')`)), 'u góry strony pasek jest przezroczysty');
  await page.shot('08-home');

  // Wyszukiwarka
  await search(page, 'majowka');
  t.eq(await visibleTitles(page), ['Majówka'], 'szukanie bez polskich znaków („majowka”)');
  t.ok(await page.eval(`document.querySelector('.memories').hidden`), 'podczas szukania wspomnienia są ukryte');
  t.eq(await page.eval(`[...document.querySelectorAll('.chip')].map((c) => c.disabled)`), [false, true, true, true], 'lata bez wyników są wyszarzone');
  await search(page, 'lipiec');
  t.eq(await visibleTitles(page), ['2 lipca', 'Chorwacja'], 'szukanie po nazwie miesiąca');
  await search(page, 'sierpnia 2024');
  t.eq((await visibleTitles(page)).length, 2, 'szukanie po dacie („sierpnia 2024”)');
  await search(page, 'qwerty');
  t.ok(await page.eval(`!document.querySelector('.search-empty').hidden`), 'komunikat „Nic nie znaleziono”');
  await page.eval(`document.querySelector('.search').focus()`);
  await page.key('Escape');
  await page.sleep(100);
  t.ok((await visibleTitles(page)).length > 20, 'Escape czyści wyszukiwanie');

  // Skok do roku
  await page.eval(`[...document.querySelectorAll('.chip')].find((c) => c.textContent === '2023').click()`);
  await page.sleep(1200);
  const jump = await page.eval(`({
    top: document.querySelector('.group[data-year="2023"]').getBoundingClientRect().top,
    toolbar: document.querySelector('.toolbar').getBoundingClientRect().bottom,
    active: document.querySelector('.chip.active')?.textContent,
  })`);
  t.ok(jump.top >= jump.toolbar - 2 && jump.top < jump.toolbar + 60, 'kliknięcie roku przewija do jego albumów');
  t.eq(jump.active, '2023', 'aktywny rok podświetlony');
  t.ok(await page.eval(`document.querySelector('.toolbar').classList.contains('stuck')`), 'przyklejony pasek dostaje tło');
  await page.shot('08-jump');

  // Okładki
  await page.eval(`window.scrollTo(0, 0)`);
  const covers = await page.eval(`import('/js/data.js').then(async (data) => {
    const tiles = [...document.querySelectorAll('.group:not(.memories) a.tile')];
    const id = (text) => tiles.find((t) => t.textContent.includes(text)).getAttribute('href').split('/f/')[1];
    const withFile = await data.getFolder(id('Wakacje nad morzem'));
    const without = await data.getFolder(id('Mazury'));
    return { file: withFile.cover.name, inGrid: withFile.images.some((i) => i.name === 'okladka.jpg'), count: withFile.images.length, ratio: without.cover.ratio };
  })`);
  t.eq(covers.file, 'okladka.jpg', 'plik okladka.jpg jest okładką dnia');
  t.ok(!covers.inGrid && covers.count === 42, 'okladka.jpg nie pojawia się w siatce zdjęć');
  t.ok(covers.ratio >= 1.2, 'bez okladka.jpg okładką jest zdjęcie poziome');

  await openFolder(page, 'Wakacje nad morzem');
  t.ok(await page.waitFor(`document.querySelector('.hero-folder.has-cover')`, 10000), 'nagłówek dnia z okładką w tle');
  t.ok(await page.eval(`getComputedStyle(document.querySelector('.hero-cover')).display === 'block'`), 'okładka jako odbitka obok daty');
  t.eq(await page.eval(`document.querySelector('.hero .meta').textContent`), 'Wakacje nad morzem · 42 zdjęcia', 'liczba zdjęć bez okładki');
  await page.waitFor(`document.querySelectorAll('.ph.loaded').length >= 6`, 20000);
  await page.shot('08-folder');

  // Telefon
  await page.viewport(390, 844, true);
  await page.eval(`history.back()`);
  await page.sleep(800);
  t.eq(await page.eval(`document.documentElement.scrollWidth`), 390, 'telefon: brak przewijania w poziomie');
  t.ok(await page.eval(`document.querySelector('.search-box').getBoundingClientRect().width > 300`), 'telefon: wyszukiwarka na całą szerokość');
  await page.shot('08-mobile');
};
