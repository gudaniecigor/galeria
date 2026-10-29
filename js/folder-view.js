import { CONFIG } from './config.js';
import * as data from './data.js';
import * as images from './images.js';
import { DriveError } from './drive.js';
import { albumsLabel, normalize, photosLabel, searchText, yearsAgoLabel } from './dates.js';
import { photoGrid } from './grid.js';
import { h, icon } from './ui.js';
import { CancelledError } from './util.js';

const MEMORY_DAYS = 3; // „wspomnienia”: ten sam dzień ± 3 dni w poprzednich latach
const DAY = 86_400_000;

// Widok jednego folderu: kafelki podfolderów (np. dni) pogrupowane po latach + siatka zdjęć.
// Strona główna ma dodatkowo wyszukiwarkę, pasek lat i „wspomnienia” sprzed lat.
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
    if (folder.folders.length) {
      const sections = folderSections(folder.folders);
      const recent = isRoot ? memories(folder.folders) : null;
      if (isRoot && folder.folders.length >= 6) parts.push(...toolbar(sections, recent));
      if (recent) parts.push(recent);
      parts.push(...sections.map((section) => section.el));
    }
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

  // --- nagłówek z rozmytym zdjęciem w tle ---
  function hero(folder) {
    const backdrop = h('img', { alt: '' });
    const cover = h('img', { class: 'hero-cover', alt: '' });
    const section = h('section', { class: `hero ${isRoot ? 'hero-root' : 'hero-folder'}` },
      h('div', { class: 'hero-bg', 'aria-hidden': 'true' }, backdrop),
      h('div', { class: 'hero-text' }, ...heroText(folder)),
      isRoot ? null : cover);

    const show = (file) =>
      images.thumbUrl(file).then((url) => {
        backdrop.src = url;
        cover.src = url;
        section.classList.add('has-cover');
      }, () => {});
    if (!isRoot && folder.cover) show(folder.cover);
    // Na stronie głównej tło z okładki najnowszego dnia.
    if (isRoot && folder.folders[0]) data.getFolder(folder.folders[0].id).then((first) => first.cover && show(first.cover), () => {});
    return section;
  }

  function heroText(folder) {
    if (isRoot) {
      const years = folder.folders.filter((f) => f.info.dated).map((f) => f.info.year);
      const min = Math.min(...years);
      const max = Math.max(...years);
      const meta = [
        folder.folders.length ? albumsLabel(folder.folders.length) : null,
        years.length ? (min === max ? `${min}` : `${min}–${max}`) : null,
        folder.images.length ? photosLabel(folder.images.length) : null,
      ];
      return [
        h('p', { class: 'eyebrow' }, CONFIG.subtitle),
        h('h1', {}, CONFIG.title),
        h('p', { class: 'meta' }, meta.filter(Boolean).join(' · ')),
      ];
    }
    const { info } = folder;
    const meta = [
      info.note,
      folder.images.length ? photosLabel(folder.images.length) : null,
      folder.folders.length ? albumsLabel(folder.folders.length) : null,
    ];
    return [
      h('p', { class: 'eyebrow' }, info.weekday ?? 'Album'),
      h('h1', {}, info.full || folder.name),
      h('p', { class: 'meta' }, meta.filter(Boolean).join(' · ')),
      folder.images.length > 1
        ? h('div', { class: 'hero-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => onSlideshow(folder) }, icon('play', 16), 'Pokaz slajdów'))
        : null,
    ];
  }

  // --- grupy lat ---
  function folderSections(list) {
    if (!list.some((f) => f.info.dated)) {
      const grid = tileGrid(list);
      return [{ label: null, el: grid.el, tiles: grid.tiles }];
    }
    const groups = new Map();
    for (const folder of list) {
      const key = folder.info.dated ? String(folder.info.year) : 'Bez daty';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(folder);
    }
    return [...groups].map(([label, folders]) => {
      const grid = tileGrid(folders);
      const section = h('section', { class: 'group', 'data-year': label },
        h('div', { class: 'group-head' }, h('h2', {}, label), h('span', { class: 'count' }, albumsLabel(folders.length))),
        grid.el);
      return { label, el: section, tiles: grid.tiles };
    });
  }

  // --- „Wspomnienia”: te same dni w poprzednich latach ---
  function memories(list) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const found = [];
    for (const folder of list) {
      const { info } = folder;
      if (info.precision !== 'day') continue;
      for (const year of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
        const sameDay = new Date(year, info.date.getMonth(), info.date.getDate());
        const years = year - info.year;
        if (years >= 1 && Math.abs(sameDay - today) <= MEMORY_DAYS * DAY) {
          found.push({ folder, years });
          break;
        }
      }
    }
    if (!found.length) return null;
    found.sort((a, b) => a.years - b.years);
    const grid = tileGrid(found.slice(0, 8).map((m) => m.folder), (folder) => yearsAgoLabel(found.find((m) => m.folder === folder).years));
    return h('section', { class: 'group memories' },
      h('div', { class: 'group-head' }, h('h2', {}, 'Wspomnienia'), h('span', { class: 'count' }, 'te dni w poprzednich latach')),
      grid.el);
  }

  // --- wyszukiwarka i pasek lat ---
  function toolbar(sections, recent) {
    const searchable = sections.flatMap((section) => section.tiles);
    const input = h('input', {
      class: 'search', type: 'search', placeholder: 'Szukaj: data, miesiąc, nazwa…',
      'aria-label': 'Szukaj albumu', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false',
    });
    const empty = h('p', { class: 'search-empty', hidden: true }, 'Nic nie znaleziono.');
    const years = sections.filter((section) => section.label);
    const chips = years.map((section) =>
      h('button', {
        class: 'chip', type: 'button',
        onclick: () => section.el.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      }, section.label));

    input.addEventListener('input', () => {
      const words = normalize(input.value).split(/\s+/).filter(Boolean);
      let any = false;
      for (const tile of searchable) {
        const match = words.every((word) => tile.text.includes(word));
        tile.el.hidden = !match;
        any ||= match;
      }
      sections.forEach((section) => {
        const visible = section.tiles.some((tile) => !tile.el.hidden);
        section.el.hidden = !visible;
        const chip = chips[years.indexOf(section)];
        if (chip) chip.disabled = !visible;
      });
      if (recent) recent.hidden = words.length > 0;
      empty.hidden = any;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
      }
    });

    // Podświetlenie roku, który jest aktualnie na ekranie.
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!el.isConnected) return;
        let active = -1;
        years.forEach((section, i) => {
          if (!section.el.hidden && section.el.getBoundingClientRect().top < 200) active = i;
        });
        chips.forEach((chip, i) => chip.classList.toggle('active', i === Math.max(active, 0)));
      });
    };
    // „/” przenosi do wyszukiwarki.
    const onKey = (e) => {
      if (e.key !== '/' || !el.isConnected || e.target.closest?.('input, textarea') || document.documentElement.classList.contains('lb-open')) return;
      e.preventDefault();
      input.focus();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onKey);
    onScroll();

    const bar = h('div', { class: 'toolbar' },
      h('label', { class: 'search-box' }, icon('search', 18), input),
      chips.length > 1 ? h('nav', { class: 'chips', 'aria-label': 'Lata' }, chips) : null,
      empty);
    // Tło paska pojawia się dopiero, gdy przyklei się do góry ekranu.
    const sentinel = h('div', { class: 'toolbar-sentinel', 'aria-hidden': 'true' });
    const stuck = new IntersectionObserver(([entry]) => {
      bar.classList.toggle('stuck', !entry.isIntersecting && entry.boundingClientRect.top < 200);
    }, { rootMargin: '-80px 0px 0px 0px' });
    stuck.observe(sentinel);

    disposers.push(() => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKey);
      stuck.disconnect();
    });
    return [sentinel, bar];
  }

  // --- kafelki ---
  function tileGrid(list, leadFor = null) {
    const created = list.map((folder, i) => {
      const tile = folderTile(folder, leadFor?.(folder));
      tile.el.style.setProperty('--i', Math.min(i, 11));
      tiles.set(tile.el, tile);
      tileObserver.observe(tile.el);
      return tile;
    });
    return { el: h('div', { class: 'tiles' }, created.map((tile) => tile.el)), tiles: created };
  }

  function folderTile(folder, customLead) {
    const { info } = folder;
    const title = info.note || info.short || folder.name;
    const lead = customLead ?? (info.note ? (info.dated ? info.short : null) : info.weekday);
    const img = h('img', { alt: '', decoding: 'async', draggable: 'false' });
    const subline = h('div', { class: 'tile-sub' }, lead ?? ' ');
    const el = h('a', { class: 'tile', href: folderHref(folder.id), title: folder.name },
      h('div', { class: 'tile-stack' },
        h('div', { class: 'tile-media' }, img, h('span', { class: 'tile-placeholder' }, icon('image', 28))),
        h('div', { class: 'tile-body' }, h('div', { class: 'tile-title' }, title), subline)));
    return { folder, el, img, subline, lead, text: searchText(folder.name, info), started: false };
  }

  async function loadTile(tile) {
    tile.started = true;
    try {
      const folder = await data.getFolder(tile.folder.id);
      const count = folder.images.length
        ? photosLabel(folder.images.length)
        : folder.folders.length ? albumsLabel(folder.folders.length) : 'Pusty';
      tile.subline.textContent = [tile.lead, count].filter(Boolean).join(' · ');
      if (!folder.cover) {
        tile.el.classList.add('no-cover');
        return;
      }
      tile.img.src = await images.thumbUrl(folder.cover, () => tile.el.isConnected);
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
