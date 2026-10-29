import { lbState, login, openFolder } from './_helpers.mjs';

export default async (page, t) => {
  await page.viewport(1280, 800);
  await login(page, t);
  await openFolder(page, 'Wigilia');
  await page.waitFor(`document.querySelectorAll('.ph').length > 5`);
  await page.eval(`document.querySelectorAll('.ph')[2].click()`);
  await page.waitFor(`document.querySelector('.lb-frame')?.classList.contains('is-full')`);

  await page.reload(500);
  t.ok(await page.waitFor(`document.querySelector('.lb') && !document.querySelector('.lb').hidden`), 'po odświeżeniu otwiera się to samo zdjęcie (bez logowania)');
  t.ok((await lbState(page)).count?.startsWith('3 /'), 'to samo miejsce w folderze');
  await page.key('Escape');
  t.ok(await page.waitFor(`document.querySelector('.lb').hidden && !location.hash.includes('/p/')`), 'zamknięcie po odświeżeniu wraca do folderu');

  await page.clickSel('.hero-actions .btn');
  t.ok(await page.waitFor(`document.querySelector('.lb-count')?.textContent.startsWith('1 /')`), 'pokaz slajdów startuje od 1. zdjęcia');
  t.ok(await page.waitFor(`document.querySelector('.lb-count').textContent.startsWith('2 /')`, 7000), 'pokaz slajdów sam przechodzi dalej');
  await page.clickSel('.lb-actions .icon-btn[aria-label="Zamknij"]');
  t.ok(await page.waitFor(`document.querySelector('.lb').hidden`), 'przycisk Zamknij');

  await page.eval(`document.querySelectorAll('.ph')[0].click()`);
  await page.waitFor(`document.querySelector('.lb-frame')?.classList.contains('is-full')`);
  await page.clickSel('.lb-actions .icon-btn[aria-label="Pobierz oryginał"]');
  t.ok(await page.waitFor(`document.querySelector('.toast')?.textContent === 'Pobieranie oryginału…'`), 'pobieranie oryginału');

  await page.click(60, 700);
  t.ok(await page.waitFor(`document.querySelector('.lb').hidden`), 'kliknięcie obok zdjęcia zamyka podgląd');
};
