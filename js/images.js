import { CONFIG } from './config.js';
import * as drive from './drive.js';
import { createQueue } from './util.js';

const THUMB_SIZE = 720;
const FULL_SIZE = 2400;
const CACHE_NAME = 'galeria-miniatury-v1';
const LINKS_KEY = 'galeria.directThumbs';
const MAX_THUMBS = 800;
const MAX_FULL = 8;

export class UnsupportedImageError extends Error {
  constructor() {
    super('Nieobsługiwany format zdjęcia');
    this.name = 'UnsupportedImageError';
  }
}

const thumbQueue = createQueue(4);
const fullQueue = createQueue(2);
const thumbs = new Map(); // id -> object URL (LRU)
const fulls = new Map(); // id -> Promise<object URL> (LRU)
const pending = new Map();

// Gotowe miniatury Google (thumbnailLink) działają tylko, gdy plik jest dostępny bez logowania.
// Sprawdzamy to przy pierwszej próbie, a potem pobieramy zdjęcia przez API i zmniejszamy je w przeglądarce.
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

const sized = (link, size) => link.replace(/=s\d+$/, `=s${size}`);

async function viaLink(file, size) {
  if (!directLinks || !file.thumbnailLink) return null;
  try {
    const response = await fetch(sized(file.thumbnailLink, size), { credentials: 'omit', referrerPolicy: 'no-referrer' });
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

// Zmniejsza zdjęcie tak, by krótszy bok miał ok. `size` px — wystarczy do siatki i okładek.
async function shrink(blob, size) {
  const img = await decode(blob);
  try {
    const { naturalWidth: w, naturalHeight: h } = img;
    const scale = Math.min(1, size / Math.min(w, h), (size * 2) / Math.max(w, h));
    if (scale === 1 && blob.size < 500_000) return blob;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((out) => (out ? resolve(out) : reject(new UnsupportedImageError())), 'image/jpeg', 0.82),
    );
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

const cacheKey = (file) =>
  `https://miniatury.galeria/${file.id}?v=${encodeURIComponent(file.md5Checksum || file.modifiedTime || '')}`;

async function cacheGet(file) {
  if (!CONFIG.cacheThumbnails || !('caches' in window)) return null;
  try {
    const hit = await (await caches.open(CACHE_NAME)).match(cacheKey(file));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

async function cachePut(file, blob) {
  if (!CONFIG.cacheThumbnails || !('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey(file), new Response(blob, { headers: { 'Content-Type': blob.type } }));
  } catch {
    // brak miejsca albo tryb prywatny — trudno, następnym razem pobierzemy ponownie
  }
}

async function thumbBlob(file, wanted) {
  const cached = await cacheGet(file);
  if (cached) return cached;
  return thumbQueue(async () => {
    const blob = (await viaLink(file, THUMB_SIZE)) ?? (await shrink(await drive.download(file.id), THUMB_SIZE / 1.5));
    cachePut(file, blob);
    return blob;
  }, wanted);
}

export const peekThumb = (file) => thumbs.get(file.id) ?? null;

export function thumbUrl(file, wanted) {
  const hit = thumbs.get(file.id);
  if (hit) {
    thumbs.delete(file.id);
    thumbs.set(file.id, hit);
    return Promise.resolve(hit);
  }
  let promise = pending.get(file.id);
  if (!promise) {
    promise = thumbBlob(file, wanted)
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
      .finally(() => pending.delete(file.id));
    pending.set(file.id, promise);
  }
  return promise;
}

export function fullUrl(file) {
  let promise = fulls.get(file.id);
  if (promise) {
    fulls.delete(file.id);
    fulls.set(file.id, promise);
    return promise;
  }
  promise = fullQueue(async () => (await viaLink(file, FULL_SIZE)) ?? drive.download(file.id)).then((blob) =>
    URL.createObjectURL(blob),
  );
  fulls.set(file.id, promise);
  promise.catch(() => {
    if (fulls.get(file.id) === promise) fulls.delete(file.id);
  });
  while (fulls.size > MAX_FULL) {
    const [oldId, old] = fulls.entries().next().value;
    fulls.delete(oldId);
    old.then((url) => URL.revokeObjectURL(url), () => {});
  }
  return promise;
}

// Zwalnia pamięć RAM; miniatury zapisane w przeglądarce zostają na kolejną wizytę.
export function releaseMemory() {
  for (const url of thumbs.values()) URL.revokeObjectURL(url);
  for (const promise of fulls.values()) promise.then((url) => URL.revokeObjectURL(url), () => {});
  thumbs.clear();
  fulls.clear();
  pending.clear();
}
