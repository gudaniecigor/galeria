import { login, openFolder } from './_helpers.mjs';

export default async (page, t) => {
  await page.viewport(1280, 800);

  // Pliki z miniaturką EXIF: rozmyty podgląd pojawia się przed właściwą miniaturą
  await login(page, t, '?exif&delay=1500');
  await openFolder(page, 'Mazury');
  t.ok(await page.waitFor(`document.querySelectorAll('.ph.preview').length >= 3`, 15000), 'rozmyty podgląd z miniaturki EXIF, zanim dojdzie miniatura');
  const early = await page.eval(`({ preview: document.querySelectorAll('.ph.preview').length, loaded: document.querySelectorAll('.ph.loaded').length })`);
  await page.shot('09-preview');
  t.ok(early.preview > early.loaded, `podglądy wyprzedzają miniatury (podglądy: ${early.preview}, miniatury: ${early.loaded})`);
  t.ok(await page.eval(`__mockLog.some((l) => l[0] === 'range')`), 'pobierany jest tylko początek pliku');
  t.ok(await page.waitFor(`document.querySelectorAll('.ph.loaded').length >= 8`, 40000), 'właściwe miniatury zastępują podglądy');
  t.eq(await page.eval(`document.querySelectorAll('.ph.loaded.preview').length`), 0, 'po wczytaniu nie zostaje rozmycie');

  // Pliki bez miniaturki EXIF: po kilku próbach strona przestaje próbować
  await page.eval(`localStorage.clear(); sessionStorage.clear(); caches.keys().then((k) => Promise.all(k.map((n) => caches.delete(n))))`);
  await login(page, t);
  await openFolder(page, 'Wigilia');
  await page.waitFor(`document.querySelectorAll('.ph.loaded').length >= 10`, 30000);
  const probes = await page.eval(`({ ranges: __mockLog.filter((l) => l[0] === 'range').length, off: localStorage.getItem('galeria.exifPreviews') })`);
  t.eq(probes.off, 'off', 'bez miniaturek EXIF podglądy zostają wyłączone');
  t.ok(probes.ranges <= 8, `tylko kilka prób (${probes.ranges})`);
};
