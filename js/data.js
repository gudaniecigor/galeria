import { CONFIG } from './config.js';
import * as drive from './drive.js';
import { describeFolder } from './dates.js';
import { createQueue } from './util.js';

const ROOT = CONFIG.rootFolderId;
const listQueue = createQueue(4);
const collator = new Intl.Collator('pl', { numeric: true, sensitivity: 'base' });

let folders = new Map(); // id -> Promise<Folder>
let parents = new Map(); // id folderu -> id rodzica (tylko foldery wewnątrz galerii)
let names = new Map();

export function reset() {
  folders = new Map();
  parents = new Map();
  names = new Map();
}

export const parentOf = (id) => (id === ROOT ? null : parents.get(id) ?? ROOT);

// Sprawdza, czy zalogowane konto widzi główny folder galerii.
export async function checkRoot() {
  const root = await drive.getFile(ROOT, 'id,name,mimeType');
  if (root.mimeType !== drive.FOLDER) throw new drive.DriveError(404, 'Podany identyfikator nie jest folderem.');
  names.set(ROOT, root.name);
  return root;
}

// Pilnuje, żeby przez adres strony dało się otworzyć tylko foldery leżące wewnątrz galerii.
export async function ensureInsideGallery(id) {
  if (id === ROOT || parents.has(id)) return true;
  const chain = [];
  let current = id;
  try {
    for (let depth = 0; depth < 10; depth++) {
      const file = await drive.getFile(current, 'id,name,mimeType,parents');
      if (depth === 0 && file.mimeType !== drive.FOLDER) return false;
      names.set(file.id, file.name);
      const parent = file.parents?.[0];
      if (!parent) return false;
      chain.push([file.id, parent]);
      if (parent === ROOT || parents.has(parent)) {
        for (const [child, p] of chain) parents.set(child, p);
        return true;
      }
      current = parent;
    }
  } catch (err) {
    if (err.status === 404 || err.status === 403) return false;
    throw err;
  }
  return false;
}

export function getFolder(id, { priority = false } = {}) {
  let promise = folders.get(id);
  if (!promise) {
    const load = () => drive.listChildren(id);
    promise = (priority ? load() : listQueue(load)).then((children) => build(id, children));
    promise.catch(() => {
      if (folders.get(id) === promise) folders.delete(id);
    });
    folders.set(id, promise);
  }
  return promise;
}

function build(id, { folders: subfolders, images }) {
  for (const folder of subfolders) {
    parents.set(folder.id, id);
    names.set(folder.id, folder.name);
    folder.info = describeFolder(folder.name);
  }
  subfolders.sort(compareFolders);

  for (const image of images) {
    Object.assign(image, takenAt(image));
    image.ratio = ratioOf(image);
  }
  images.sort(CONFIG.photoOrder === 'name' ? byName : byTaken);

  const name = names.get(id) ?? '';
  return { id, name, info: describeFolder(name), folders: subfolders, images };
}

function compareFolders(a, b) {
  if (a.info.dated !== b.info.dated) return a.info.dated ? -1 : 1;
  if (a.info.dated && a.info.time !== b.info.time) {
    return CONFIG.folderOrder === 'oldest' ? a.info.time - b.info.time : b.info.time - a.info.time;
  }
  return collator.compare(a.name, b.name);
}

const byName = (a, b) => collator.compare(a.name, b.name);
const byTaken = (a, b) => a.takenAt - b.takenAt || byName(a, b);

// Data zrobienia zdjęcia z EXIF („2024:07:15 14:23:01”), a gdy jej brak — data wgrania na Dysk.
function takenAt(image) {
  const m = image.imageMediaMetadata?.time?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m && +m[1] > 1970) {
    const time = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    if (!Number.isNaN(time)) return { takenAt: time, takenExact: true };
  }
  return { takenAt: Date.parse(image.createdTime) || 0, takenExact: false };
}

function ratioOf(image) {
  const meta = image.imageMediaMetadata;
  if (!meta?.width || !meta?.height) return 4 / 3;
  const ratio = meta.rotation % 2 === 1 ? meta.height / meta.width : meta.width / meta.height;
  return Math.min(Math.max(ratio, 0.4), 3);
}
