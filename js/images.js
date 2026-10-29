import { CONFIG } from './config.js';
import * as drive from './drive.js';
import { createQueue } from './util.js';

// Rozmiary: miniatura do siatki i okładek, duży podgląd do oglądania na pełnym ekranie.
const THUMB = { short: 480, long: 1440, quality: 0.82 };
const LARGE = { long: 2048, quality: 0.85 };
const LINK_THUMB = 720;
const LINK_LARGE = 2048;

const THUMB_CACHE = 'galeria-miniatury-v1';
const LARGE_CACHE = 'galeria-podglady-v1';
const OWNER_KEY = 'galeria.cacheOwner';
const LINKS_KEY = 'galeria.directThumbs';
const MAX_THUMBS = 800; // miniatury trzymane w pamięci RAM
const MAX_PHOTOS = 10; // duże zdjęcia trzymane w pamięci RAM
const MAX_LARGE_STORED = 400; // duże podglądy zapisane w przeglądarce (ok. 200 MB)

export class UnsupportedImageError extends Error {
  constructor() {
    super('Nieobsługiwany format zdjęcia');
    this.name = 'UnsupportedImageError';
  }
}

const downloads = createQueue(4);
const photoDownloads = createQueue(2);
const thumbs = new Map(); // id -> object URL (LRU)
const pendingThumbs = new Map();
const views = new Map(); // id -> Promise<{ url, original }> (LRU)
const originals = new Map(); // id -> Promise<object URL> (LRU)

// --- miniatury Google (thumbnailLink) ---
// Działają tylko, gdy plik jest dostępny bez logowania. Sprawdzamy to przy pierwszej próbie,
// a potem pobieramy zdjęcia przez API i zmniejszamy je w przeglądarce.
let directLinks = readSetting();

function readSetting() {
  try {
    return sessionStorage.getItem(LINKS_KEY) !== 'off';
  } catch {
    return true;
  }
}

function disableDirectLinks() {
  if (!directLinks) return;
  directLinks = false;
  try {
    sessionStorage.setItem(LINKS_KEY, 'off');
  } catch {
    // bez znaczenia — sprawdzimy ponownie po odświeżeniu
  }
}

async function viaLink(file, size) {
  if (!directLinks || !file.thumbnailLink) return null;
  try {
    const response = await fetch(file.thumbnailLink.replace(/=s\d+$/, `=s${size}`), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (response.ok) {
      const blob = await response.blob();
      if (blob.type.startsWith('image/')) return blob;
    } else if (response.status === 401 || response.status === 403) {
      disableDirectLinks();
    }
  } catch {
    disableDirectLinks();
  }
  return null;
}

// --- zmniejszanie zdjęć (w osobnym wątku, gdy przeglądarka na to pozwala) ---
function targetSize(width, height, { short, long }) {
  let scale = 1;
  if (short) scale = Math.min(scale, short / Math.min(width, height));
  if (long) scale = Math.min(scale, long / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), scale];
}

function decode(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new UnsupportedImageError());
    };
    img.src = URL.createObjectURL(blob);
  });
}

async function resizeOnMainThread(blob, outputs) {
  const img = await decode(blob);
  try {
    const results = [];
    for (const output of outputs) {
      const [width, height, scale] = targetSize(img.naturalWidth, img.naturalHeight, output);
      if (scale === 1) {
        results.push(blob);
        continue;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1a1a1e';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      results.push(await new Promise((resolve, reject) =>
        canvas.toBlob((out) => (out ? resolve(out) : reject(new UnsupportedImageError())), 'image/jpeg', output.quality)));
    }
    return results;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

const resize = createResizer();

function createResizer() {
  const supported = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'convertToBlob' in OffscreenCanvas.prototype;
  if (!supported) return resizeOnMainThread;

  // Każde dekodowanie dużego zdjęcia zajmuje ~100–200 MB pamięci, więc liczbę wątków ograniczamy.
  const queue = createQueue((navigator.hardwareConcurrency || 4) >= 8 ? 3 : 2);
  const idle = [];
  let seq = 0;
  let broken = false;

  const run = (blob, outputs) =>
    new Promise((resolve, reject) => {
      let worker;
      try {
        worker = idle.pop() ?? new Worker(new URL('./resize-worker.js', import.meta.url));
      } catch (err) {
        reject(err);
        return;
      }
      const id = ++seq;
      worker.onmessage = ({ data }) => {
        if (data.id !== id) return;
        worker.onmessage = worker.onerror = null;
        idle.push(worker);
        if (data.blobs) resolve(data.blobs);
        else if (data.error === 'decode') reject(new UnsupportedImageError());
        else reject(new Error(data.message || 'worker'));
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        worker.terminate();
        reject(new Error('worker'));
      };
      worker.postMessage({ id, blob, outputs });
    });

  return (blob, outputs) => {
    if (broken) return resizeOnMainThread(blob, outputs);
    return queue(() => run(blob, outputs)).catch((err) => {
      if (err instanceof UnsupportedImageError) throw err;
      broken = true; // wątek nie działa w tej przeglądarce — od teraz zmniejszamy na miejscu
      return resizeOnMainThread(blob, outputs);
    });
  };
}

// --- pamięć w przeglądarce (Cache Storage) ---
const storageKey = (file) =>
  `https://pamiec.galeria/${file.id}?v=${encodeURIComponent(file.md5Checksum || file.modifiedTime || '')}`;
const storageOn = () => CONFIG.cacheThumbnails && 'caches' in window;

async function stored(cacheName, file) {
  if (!storageOn()) return null;
  try {
    const hit = await (await caches.open(cacheName)).match(storageKey(file));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

let largePuts = 0;

async function store(cacheName, file, blob) {
  if (!storageOn()) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(storageKey(file), new Response(blob, { headers: { 'Content-Type': blob.type } }));
    // Duże podglądy zajmują dużo miejsca — co jakiś czas usuwamy najstarsze.
    if (cacheName === LARGE_CACHE && ++largePuts % 20 === 0) {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_LARGE_STORED)).map((key) => cache.delete(key)));
    }
  } catch {
    // brak miejsca albo tryb prywatny — następnym razem pobierzemy ponownie
  }
}

// Zapamiętane zdjęcia należą do jednego konta — po zalogowaniu innym kontem kasujemy je.
export async function useStorageFor(email) {
  try {
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner && owner !== email) await clearStored();
    localStorage.setItem(OWNER_KEY, email);
  } catch {
    // localStorage niedostępny — nic nie zapamiętujemy na stałe
  }
}

export async function clearStored() {
  if (!('caches' in window)) return;
  try {
    await Promise.all([caches.delete(THUMB_CACHE), caches.delete(LARGE_CACHE)]);
  } catch {
    // ignoruj
  }
}

// --- miniatury ---
async function makeThumb(file, wanted) {
  const cached = await stored(THUMB_CACHE, file);
  if (cached) return cached;

  const small = await downloads(() => viaLink(file, LINK_THUMB), wanted);
  if (small) {
    store(THUMB_CACHE, file, small);
    return small;
  }
  // Trzeba pobrać całe zdjęcie — skoro już je mamy, od razu robimy też duży podgląd na później.
  const original = await downloads(() => drive.download(file.id), wanted);
  const [thumb, large] = await resize(original, [THUMB, LARGE]);
  store(THUMB_CACHE, file, thumb);
  store(LARGE_CACHE, file, large);
  return thumb;
}

export const peekThumb = (file) => thumbs.get(file.id) ?? null;

export function thumbUrl(file, wanted) {
  const hit = thumbs.get(file.id);
  if (hit) {
    thumbs.delete(file.id);
    thumbs.set(file.id, hit);
    return Promise.resolve(hit);
  }
  let promise = pendingThumbs.get(file.id);
  if (!promise) {
    promise = makeThumb(file, wanted)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        thumbs.set(file.id, url);
        if (thumbs.size > MAX_THUMBS) {
          const [oldId, oldUrl] = thumbs.entries().next().value;
          thumbs.delete(oldId);
          URL.revokeObjectURL(oldUrl);
        }
        return url;
      })
      .finally(() => pendingThumbs.delete(file.id));
    pendingThumbs.set(file.id, promise);
  }
  return promise;
}

// --- zdjęcia na pełnym ekranie ---
function remember(map, key, create, release) {
  let promise = map.get(key);
  if (promise) {
    map.delete(key);
    map.set(key, promise);
    return promise;
  }
  promise = create();
  map.set(key, promise);
  promise.catch(() => {
    if (map.get(key) === promise) map.delete(key);
  });
  while (map.size > MAX_PHOTOS) {
    const [oldKey, old] = map.entries().next().value;
    map.delete(oldKey);
    old.then(release, () => {});
  }
  return promise;
}

// Oryginał w pełnej rozdzielczości (do przybliżania i pobierania).
function original(file) {
  return remember(
    originals,
    file.id,
    async () => {
      const blob = await photoDownloads(() => drive.download(file.id));
      return { blob, url: URL.createObjectURL(blob) };
    },
    (entry) => URL.revokeObjectURL(entry.url),
  );
}

export const originalUrl = (file) => original(file).then((entry) => entry.url);
export const originalBlob = (file) => original(file).then((entry) => entry.blob);

// Zdjęcie do oglądania: zapamiętany duży podgląd (natychmiast), podgląd od Google albo oryginał.
export function photoUrl(file) {
  const promise = remember(
    views,
    file.id,
    async () => {
      const cached = await stored(LARGE_CACHE, file);
      if (cached) return { url: URL.createObjectURL(cached), original: false };
      const fromGoogle = await photoDownloads(() => viaLink(file, LINK_LARGE));
      if (fromGoogle) {
        store(LARGE_CACHE, file, fromGoogle);
        return { url: URL.createObjectURL(fromGoogle), original: false };
      }
      const { blob, url } = await original(file);
      // W tle zapamiętujemy zmniejszoną kopię — następnym razem zdjęcie otworzy się od razu.
      resize(blob, [LARGE])
        .then(([large]) => store(LARGE_CACHE, file, large))
        .catch(() => {});
      return { url, original: true };
    },
    (view) => {
      if (!view.original) URL.revokeObjectURL(view.url);
    },
  );
  // Adres oryginału należy do mapy oryginałów — nie trzymamy go tutaj, żeby nie wskazywał na zwolnioną pamięć.
  promise.then((view) => {
    if (view.original && views.get(file.id) === promise) views.delete(file.id);
  }, () => {});
  return promise;
}

// Zwalnia pamięć RAM; zdjęcia zapisane w przeglądarce zostają na kolejną wizytę.
export function releaseMemory() {
  for (const url of thumbs.values()) URL.revokeObjectURL(url);
  for (const promise of views.values()) promise.then((view) => !view.original && URL.revokeObjectURL(view.url), () => {});
  for (const promise of originals.values()) promise.then((entry) => URL.revokeObjectURL(entry.url), () => {});
  thumbs.clear();
  pendingThumbs.clear();
  views.clear();
  originals.clear();
}
