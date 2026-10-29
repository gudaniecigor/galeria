import * as images from './images.js';
import { h, icon } from './ui.js';
import { CancelledError } from './util.js';

const GAP = 6;
const rowHeight = (width) => (width < 480 ? 130 : width < 900 ? 190 : 250);
const clampRatio = (ratio) => Math.min(Math.max(ratio, 0.4), 3);

// Siatka „justified” jak w Zdjęciach Google: każdy rząd ma pełną szerokość,
// a zdjęcia zachowują proporcje. Miniatury ładują się dopiero przy przewijaniu.
export function photoGrid(files, hrefFor) {
  const el = h('div', { class: 'justified' });
  const items = files.map((file, i) => {
    const img = h('img', { alt: file.name, decoding: 'async', draggable: 'false' });
    const link = h('a', { class: 'ph', href: hrefFor(file), 'aria-label': `Zdjęcie ${i + 1} z ${files.length}` }, img);
    return { file, link, img, ratio: file.ratio, visible: false, loading: false, done: false };
  });
  const byLink = new Map(items.map((item) => [item.link, item]));
  el.append(...items.map((item) => item.link));

  let width = 0;
  let frame = 0;

  const layout = () => {
    width = el.clientWidth;
    if (!width) return;
    const target = rowHeight(width);
    let y = 0;
    let row = [];
    let sum = 0;

    const place = (height) => {
      let x = 0;
      for (const item of row) {
        const w = item.ratio * height;
        Object.assign(item.link.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${height}px` });
        x += w + GAP;
      }
      y += height + GAP;
      row = [];
      sum = 0;
    };

    for (const item of items) {
      row.push(item);
      sum += item.ratio;
      if (sum * target + GAP * (row.length - 1) >= width) place((width - GAP * (row.length - 1)) / sum);
    }
    if (row.length) place(Math.min(target, (width - GAP * (row.length - 1)) / sum));
    el.style.height = `${Math.max(0, y - GAP)}px`;
  };

  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layout);
  };

  const resize = new ResizeObserver(() => {
    if (el.clientWidth !== width) schedule();
  });
  resize.observe(el);

  async function load(item) {
    item.loading = true;
    try {
      const wanted = () => item.visible && item.link.isConnected;
      item.img.src = await images.thumbWithPreview(item.file, wanted, (preview) => {
        item.img.src = preview;
        item.link.classList.add('preview');
      });
      await item.img.decode().catch(() => {});
      item.done = true;
      item.link.classList.remove('preview');
      item.link.classList.add('loaded');
      // Metadane z Dysku czasem nie uwzględniają obrotu — poprawiamy proporcje po wczytaniu.
      const actual = item.img.naturalWidth / item.img.naturalHeight;
      if (actual && Math.abs(actual - item.ratio) / item.ratio > 0.04) {
        item.ratio = clampRatio(actual);
        schedule();
      }
    } catch (err) {
      if (err instanceof CancelledError) return;
      item.done = true;
      const unsupported = err instanceof images.UnsupportedImageError;
      item.img.hidden = true;
      item.link.classList.add('failed');
      item.link.append(h('span', { class: 'ph-note' }, icon('image', 22), unsupported ? 'Brak podglądu' : 'Nie wczytano'));
    } finally {
      item.loading = false;
    }
  }

  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const item = byLink.get(entry.target);
        item.visible = entry.isIntersecting;
        if (item.visible && !item.loading && !item.done) load(item);
      }
    },
    { rootMargin: '1500px 0px' },
  );
  for (const item of items) visibility.observe(item.link);

  return {
    el,
    destroy() {
      resize.disconnect();
      visibility.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
