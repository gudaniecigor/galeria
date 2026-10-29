import { CONFIG } from './config.js';
import * as data from './data.js';
import * as images from './images.js';
import { DriveError } from './drive.js';
import { albumsLabel, photosLabel } from './dates.js';
import { photoGrid } from './grid.js';
import { h, icon } from './ui.js';
import { CancelledError } from './util.js';

// Widok jednego folderu: kafelki podfolderów (np. dni) pogrupowane po latach + siatka zdjęć.
export function createFolderView(folderId, { isRoot, folderHref, photoHref, onSlideshow, onRetry }) {
  const el = h('main', { class: 'page', id: 'main' });
  const disposers = [];
  el.append(heroSkeleton(), h('div', { class: 'tiles' }, Array.from({ length: 8 }, () => tileSkeleton())));

  const tiles = new Map();
  const tileObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const tile = tiles.get(entry.target);
        if (entry.isIntersecting && tile && !tile.started) loadTile(tile);
      }
    },
    { rootMargin: '1200px 0px' },
  );
  disposers.push(() => tileObserver.disconnect());

  const ready = (isRoot ? Promise.resolve(true) : data.ensureInsideGallery(folderId)).then((inside) => {
    if (!inside) throw new DriveError(404, 'Ten folder nie należy do galerii albo nie masz do niego dostępu.');
    return data.getFolder(folderId, { priority: true });
  });
  ready.then(render, renderError);

  function render(folder) {
    const parts = [hero(folder)];
    if (folder.folders.length) parts.push(...folderSections(folder.folders));
    if (folder.images.length) {
      if (folder.folders.length) parts.push(h('h2', { class: 'section-title' }, 'Zdjęcia'));
      const grid = photoGrid(folder.images, (file) => photoHref(folder.id, file.id));
      disposers.push(grid.destroy);
      parts.push(grid.el);
    }
    if (!folder.folders.length && !folder.images.length) {
      parts.push(h('div', { class: 'empty' }, icon('image', 28), h('p', {}, 'Ten folder jest pusty.')));
    }
    el.replaceChildren(...parts);
    prefetchListings(folder.folders);
  }

  // W wolnej chwili pobieramy listy zdjęć wszystkich folderów (to małe zapytania),
  // żeby wejście do dowolnego dnia było natychmiastowe.
  function prefetchListings(list) {
    if (!list.length) return;
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
    idle(() => {
      for (const folder of list) data.getFolder(folder.id).catch(() => {});
    });
  }

  function renderError(err) {
    el.replaceChildren(
      h('div', { class: 'state' },
        h('div', { class: 'state-card' },
          h('div', { class: 'state-icon' }, icon('alert', 24)),
          h('h1', {}, 'Nie udało się otworzyć'),
          h('p', {}, err.message || 'Spróbuj ponownie za chwilę.'),
          h('div', { class: 'state-actions' },
            h('button', { class: 'btn', type: 'button', onclick: onRetry }, 'Spróbuj ponownie'),
            isRoot ? null : h('a', { class: 'btn btn-ghost', href: folderHref(CONFIG.rootFolderId) }, 'Wróć do galerii')))),
    );
  }

  function hero(folder) {
    if (isRoot) {
      const years = folder.folders.filter((f) => f.info.dated).map((f) => f.info.year);
      const min = Math.min(...years);
      const max = Math.max(...years);
      const meta = [
        folder.folders.length ? albumsLabel(folder.folders.length) : null,
        years.length ? (min === max ? `${min}` : `${min}–${max}`) : null,
        folder.images.length ? photosLabel(folder.images.length) : null,
      ];
      return h('section', { class: 'hero' },
        h('p', { class: 'eyebrow' }, CONFIG.subtitle),
        h('h1', {}, CONFIG.title),
        h('p', { class: 'meta' }, meta.filter(Boolean).join(' · ')));
    }

    const { info } = folder;
    const meta = [
      info.note,
      folder.images.length ? photosLabel(folder.images.length) : null,
      folder.folders.length ? albumsLabel(folder.folders.length) : null,
    ];
    return h('section', { class: 'hero hero-folder' },
      h('p', { class: 'eyebrow' }, info.weekday ?? 'Album'),
      h('h1', {}, info.full || folder.name),
      h('p', { class: 'meta' }, meta.filter(Boolean).join(' · ')),
      folder.images.length > 1
        ? h('div', { class: 'hero-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => onSlideshow(folder) }, icon('play', 16), 'Pokaz slajdów'))
        : null);
  }

  function folderSections(list) {
    if (!list.some((f) => f.info.dated)) return [tileGrid(list)];
    const groups = new Map();
    for (const folder of list) {
      const key = folder.info.dated ? String(folder.info.year) : 'Bez daty';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(folder);
    }
    return [...groups].map(([label, folders]) =>
      h('section', { class: 'group' },
        h('div', { class: 'group-head' }, h('h2', {}, label), h('span', { class: 'count' }, albumsLabel(folders.length))),
        tileGrid(folders)));
  }

  function tileGrid(list) {
    return h('div', { class: 'tiles' }, list.map((folder) => {
      const tile = folderTile(folder);
      tiles.set(tile.el, tile);
      tileObserver.observe(tile.el);
      return tile.el;
    }));
  }

  function folderTile(folder) {
    const { info } = folder;
    const title = info.note || info.short || folder.name;
    const lead = info.note ? (info.dated ? info.short : null) : info.weekday;
    const img = h('img', { alt: '', decoding: 'async', draggable: 'false' });
    const subline = h('div', { class: 'tile-sub' }, lead ?? ' ');
    const el = h('a', { class: 'tile', href: folderHref(folder.id), title: folder.name },
      h('div', { class: 'tile-stack' },
        h('div', { class: 'tile-media' }, img, h('span', { class: 'tile-placeholder' }, icon('image', 28))),
        h('div', { class: 'tile-body' }, h('div', { class: 'tile-title' }, title), subline)));
    return { folder, el, img, subline, lead, started: false };
  }

  async function loadTile(tile) {
    tile.started = true;
    try {
      const folder = await data.getFolder(tile.folder.id);
      const count = folder.images.length
        ? photosLabel(folder.images.length)
        : folder.folders.length ? albumsLabel(folder.folders.length) : 'Pusty';
      tile.subline.textContent = [tile.lead, count].filter(Boolean).join(' · ');
      const cover = folder.images[0];
      if (!cover) {
        tile.el.classList.add('no-cover');
        return;
      }
      tile.img.src = await images.thumbUrl(cover, () => tile.el.isConnected);
      await tile.img.decode().catch(() => {});
      tile.el.classList.add('loaded');
    } catch (err) {
      if (err instanceof CancelledError) tile.started = false;
      else tile.el.classList.add('no-cover');
    }
  }

  return {
    el,
    ready,
    scrollY: 0,
    destroy: () => disposers.forEach((dispose) => dispose()),
  };
}

function heroSkeleton() {
  return h('section', { class: 'hero' },
    h('div', { class: 'skeleton skel-line short' }),
    h('div', { class: 'skeleton skel-title' }),
    h('div', { class: 'skeleton skel-line' }));
}

function tileSkeleton() {
  return h('div', { class: 'tile', 'aria-hidden': 'true' }, h('div', { class: 'tile-stack' }, h('div', { class: 'tile-media skeleton' })));
}
