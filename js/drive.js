import * as auth from './auth.js';
import { sleep } from './util.js';

const API = 'https://www.googleapis.com/drive/v3';
export const FOLDER = 'application/vnd.google-apps.folder';
const FILE_FIELDS =
  'id,name,mimeType,thumbnailLink,webViewLink,createdTime,modifiedTime,md5Checksum,imageMediaMetadata(width,height,rotation,time)';
const ID_PATTERN = /^[\w-]{10,200}$/;
// Tylko formaty, które przeglądarka potrafi wyświetlić — np. pliki RAW (NEF) leżące obok JPG są pomijane,
// zamiast pobierać dziesiątki MB, których i tak nie da się pokazać.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif'];

export class DriveError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

// ID trafia do zapytania `q`, więc przepuszczamy tylko bezpieczne znaki.
export const isValidId = (id) => typeof id === 'string' && ID_PATTERN.test(id);

function assertId(id) {
  if (!isValidId(id)) throw new DriveError(400, 'Nieprawidłowy adres.');
}

let reauth = () => Promise.reject(new DriveError(401, 'Sesja wygasła.'));

// Wywoływane, gdy token wygaśnie — aplikacja prosi wtedy o ponowne zalogowanie,
// a wstrzymane zapytania ruszają dalej.
export function onAuthRequired(handler) {
  reauth = handler;
}

function describe(status) {
  if (status === 404) return 'Nie znaleziono folderu albo nie masz do niego dostępu.';
  if (status === 403) return 'Brak uprawnień do tego zasobu.';
  return `Błąd Dysku Google (kod ${status}). Spróbuj ponownie za chwilę.`;
}

async function errorReason(response) {
  try {
    const body = await response.json();
    return body?.error?.errors?.[0]?.reason || body?.error?.status || '';
  } catch {
    return '';
  }
}

async function call(path, params = {}, { raw = false, headers = {} } = {}) {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }

  let authAttempts = 0;
  for (let attempt = 0; ; attempt++) {
    const token = auth.token();
    if (!token) {
      if (authAttempts++ > 2) throw new DriveError(401, 'Nie udało się odnowić logowania.');
      await reauth();
      continue;
    }

    let response;
    try {
      response = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${token}` } });
    } catch {
      if (attempt >= 2) throw new DriveError(0, 'Brak połączenia z internetem.');
      await sleep(800 * (attempt + 1));
      continue;
    }

    if (response.ok) return raw ? response : response.json();

    if (response.status === 401) {
      auth.invalidate();
      continue;
    }

    const reason = await errorReason(response);
    const retryable = response.status === 429 || response.status >= 500 || /rateLimit/i.test(reason);
    if (retryable && attempt < 4) {
      await sleep(2 ** attempt * 600 + Math.random() * 400);
      continue;
    }
    throw new DriveError(response.status, describe(response.status));
  }
}

export async function listChildren(folderId) {
  assertId(folderId);
  const types = [FOLDER, ...IMAGE_TYPES].map((type) => `mimeType = '${type}'`).join(' or ');
  const q = `'${folderId}' in parents and trashed = false and (${types})`;
  const folders = [];
  const images = [];
  let pageToken;
  do {
    const page = await call('/files', {
      q,
      pageSize: 1000,
      pageToken,
      orderBy: 'name',
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const file of page.files ?? []) (file.mimeType === FOLDER ? folders : images).push(file);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { folders, images };
}

export function getFile(id, fields = 'id,name,mimeType,parents') {
  assertId(id);
  return call(`/files/${id}`, { fields, supportsAllDrives: true });
}

export async function about() {
  const { user } = await call('/about', { fields: 'user(displayName,emailAddress,photoLink)' });
  return { name: user.displayName, email: user.emailAddress, photo: user.photoLink };
}

export async function download(id) {
  assertId(id);
  const response = await call(`/files/${id}`, { alt: 'media', supportsAllDrives: true }, { raw: true });
  return response.blob();
}

// Pobiera tylko fragment pliku (np. początek JPG z miniaturką zapisaną przez aparat).
export async function downloadRange(id, start, end) {
  assertId(id);
  const response = await call(`/files/${id}`, { alt: 'media', supportsAllDrives: true }, { raw: true, headers: { Range: `bytes=${start}-${end}` } });
  return new Uint8Array(await response.arrayBuffer());
}
