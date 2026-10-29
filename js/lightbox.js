import * as images from './images.js';
import { formatTaken } from './dates.js';
import { h, icon, toast } from './ui.js';

const SLIDE_MS = 4500;
const TAP_ZOOM = 2.5;
const MAX_ZOOM = 6;

function iconButton(name, label, onClick, extraClass = '') {
  return h('button', { class: `icon-btn ${extraClass}`, type: 'button', title: label, 'aria-label': label, onclick: onClick }, icon(name));
}

const wideScreen = () => matchMedia('(hover: hover) and (min-width: 900px)').matches;

// Pełnoekranowy podgląd: strzałki / przesuwanie palcem, przybliżanie (dwa palce, kółko myszy,
// dwuklik), przeciągnięcie w dół = zamknięcie, pokaz slajdów, pasek miniatur, pobieranie oryginału.
class Lightbox {
  el = null;
  items = [];
  index = -1;
  handlers = {};
  seq = 0;
  zoom = 1;
  pan = { x: 0, y: 0 };
  base = null;
  playing = false;
  timer = 0;
  lastTap = 0;
  tapTimer = 0;
  stripItems = null;

  build() {
    this.ambient = h('img', { class: 'lb-ambient', alt: '', 'aria-hidden': 'true' });
    this.low = h('img', { class: 'lb-img lb-low', alt: '', draggable: 'false' });
    this.full = h('img', { class: 'lb-img lb-full', alt: '', draggable: 'false' });
    this.frame = h('div', { class: 'lb-frame' }, this.low, this.full);
    this.spinner = h('div', { class: 'lb-spinner', 'aria-hidden': 'true' });
    this.message = h('div', { class: 'lb-message', hidden: true });
    this.stage = h('div', { class: 'lb-stage' }, this.frame, this.spinner, this.message);
    this.counter = h('span', { class: 'lb-count' });
    this.playBtn = iconButton('play', 'Pokaz slajdów', () => this.togglePlay());
    this.downloadBtn = iconButton('download', 'Pobierz oryginał', () => this.download());
    this.driveLink = h('a', { class: 'icon-btn', target: '_blank', rel: 'noopener noreferrer', title: 'Otwórz w Dysku Google', 'aria-label': 'Otwórz w Dysku Google' }, icon('external'));
    this.closeBtn = iconButton('close', 'Zamknij', () => this.requestClose());
    this.prevBtn = iconButton('prev', 'Poprzednie zdjęcie', () => this.go(-1), 'lb-nav lb-prev');
    this.nextBtn = iconButton('next', 'Następne zdjęcie', () => this.go(1), 'lb-nav lb-next');
    this.caption = h('div', { class: 'lb-caption' });
    this.strip = h('div', { class: 'lb-strip', 'aria-label': 'Miniatury' });

    this.el = h('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Podgląd zdjęcia', hidden: true },
      this.ambient,
      this.stage,
      h('div', { class: 'lb-top' }, this.counter, h('div', { class: 'lb-actions' }, this.playBtn, this.downloadBtn, this.driveLink, this.closeBtn)),
      this.prevBtn,
      this.nextBtn,
      h('div', { class: 'lb-bottom' }, this.caption, this.strip));
    document.body.append(this.el);

    this.full.addEventListener('load', () => {
      this.frame.classList.add('is-full');
      this.spinner.hidden = true;
    });
    this.full.addEventListener('error', () => {
      if (this.full.getAttribute('src')) this.fail(true);
    });
    this.ambient.addEventListener('load', () => this.ambient.classList.add('ready'));
    this.onKey = this.onKey.bind(this);
    this.bindPointer();
    this.stage.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  isOpen() {
    return Boolean(this.el && !this.el.hidden);
  }

  open(items, index, handlers = {}) {
    if (!this.el) this.build();
    if (items !== this.items) {
      this.items = items;
      this.buildStrip();
    }
    this.handlers = handlers;
    if (!this.isOpen()) {
      this.returnFocus = document.activeElement;
      this.el.hidden = false;
      this.el.classList.remove('chrome-hidden');
      document.documentElement.classList.add('lb-open');
      requestAnimationFrame(() => this.el.classList.add('open'));
      document.addEventListener('keydown', this.onKey);
      this.closeBtn.focus({ preventScroll: true });
    }
    this.show(index);
  }

  close() {
    if (!this.isOpen()) return;
    this.pause();
    this.resetZoom();
    this.el.classList.remove('open');
    this.el.hidden = true;
    document.documentElement.classList.remove('lb-open');
    document.removeEventListener('keydown', this.onKey);
    this.full.removeAttribute('src');
    this.low.removeAttribute('src');
    this.ambient.removeAttribute('src');
    this.ambient.classList.remove('ready');
    this.index = -1;
    this.seq++;
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  requestClose() {
    if (this.handlers.onClose) this.handlers.onClose();
    else this.close();
  }

  show(index) {
    const file = this.items[index];
    if (!file || (index === this.index && this.full.getAttribute('src'))) return;
    const direction = this.index < 0 ? 0 : Math.sign(index - this.index);
    this.index = index;
    const seq = ++this.seq;

    this.resetZoom();
    this.frame.classList.remove('is-full');
    this.message.hidden = true;
    this.spinner.hidden = false;
    this.full.removeAttribute('src');
    this.full.alt = file.name;
    this.low.removeAttribute('src');
    this.showThumb(file, seq);

    this.counter.textContent = `${index + 1} / ${this.items.length}`;
    const when = formatTaken(file);
    this.caption.replaceChildren(when ? h('span', { class: 'lb-date' }, when) : '', h('span', { class: 'lb-name' }, file.name));
    this.driveLink.href = file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;
    this.prevBtn.disabled = index === 0;
    this.nextBtn.disabled = index === this.items.length - 1;
    this.markStrip(index);
    this.enter(direction);

    this.isOriginal = false;
    images.photoUrl(file).then(
      (view) => {
        if (seq !== this.seq) return;
        this.full.src = view.url;
        this.isOriginal = view.original;
      },
      () => {
        if (seq === this.seq) this.fail(false);
      },
    );
    // Następne zdjęcia wczytujemy z wyprzedzeniem, żeby przewijanie było natychmiastowe.
    for (const neighbour of [index + 1, index + 2, index - 1]) {
      if (this.items[neighbour]) images.photoUrl(this.items[neighbour]).catch(() => {});
    }
  }

  // Miniatura służy jako szybki podgląd (zanim dojdzie duże zdjęcie) i jako rozmyte tło.
  showThumb(file, seq) {
    const apply = (url) => {
      if (seq !== this.seq) return;
      if (!this.frame.classList.contains('is-full')) this.low.src = url;
      if (this.ambient.getAttribute('src') !== url) {
        this.ambient.classList.remove('ready');
        this.ambient.src = url;
      }
    };
    const ready = images.peekThumb(file);
    if (ready) apply(ready);
    else images.thumbUrl(file).then(apply, () => {});
  }

  // Przy przybliżaniu podmieniamy podgląd na oryginał w pełnej rozdzielczości.
  loadOriginal() {
    if (this.isOriginal) return;
    this.isOriginal = true;
    const seq = this.seq;
    images.originalUrl(this.items[this.index]).then(
      (url) => {
        if (seq === this.seq) this.full.src = url;
      },
      () => {},
    );
  }

  enter(direction) {
    const frame = this.frame;
    frame.classList.add('no-anim');
    frame.style.transform = direction ? `translate3d(${direction * 8}%, 0, 0)` : 'scale(0.97)';
    frame.style.opacity = '0';
    void frame.offsetWidth;
    frame.classList.remove('no-anim');
    frame.style.transform = '';
    frame.style.opacity = '';
  }

  fail(undecodable) {
    this.full.removeAttribute('src');
    this.spinner.hidden = true;
    this.message.hidden = false;
    this.message.replaceChildren(
      h('p', {}, undecodable
        ? 'Ta przeglądarka nie potrafi wyświetlić tego formatu zdjęcia.'
        : 'Nie udało się wczytać zdjęcia.'),
      h('a', { class: 'btn', href: this.driveLink.href, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 16), 'Otwórz w Dysku Google'));
  }

  go(delta, { fromTimer = false } = {}) {
    let next = this.index + delta;
    if (fromTimer && next >= this.items.length) next = 0;
    if (next < 0 || next >= this.items.length) return this.bump(delta);
    if (!fromTimer && this.playing) this.restartTimer();
    this.goTo(next);
  }

  goTo(index) {
    if (index === this.index) return;
    if (this.handlers.onChange) this.handlers.onChange(index);
    else this.show(index);
  }

  bump(delta) {
    this.frame.style.transform = `translate3d(${-delta * 24}px, 0, 0)`;
    setTimeout(() => {
      if (this.zoom === 1) this.frame.style.transform = '';
    }, 160);
  }

  slideOut(delta) {
    const next = this.index + delta;
    if (next < 0 || next >= this.items.length) {
      this.frame.style.transform = '';
      return;
    }
    this.frame.style.transform = `translate3d(${-delta * 30}%, 0, 0)`;
    this.frame.style.opacity = '0';
    setTimeout(() => this.go(delta), 150);
  }

  // --- pasek miniatur (tylko na większym ekranie z myszką) ---
  buildStrip() {
    this.stripObserver?.disconnect();
    this.stripItems = null;
    this.strip.replaceChildren();
    this.el.classList.toggle('has-strip', wideScreen() && this.items.length > 1);
    if (!this.el.classList.contains('has-strip')) return;

    this.stripObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const button = entry.target;
          this.stripObserver.unobserve(button);
          const img = button.firstChild;
          images.thumbUrl(this.items[Number(button.dataset.index)], () => this.isOpen()).then(
            (url) => {
              img.src = url;
              button.classList.add('loaded');
            },
            () => this.stripObserver?.observe(button),
          );
        }
      },
      { root: this.strip, rootMargin: '0px 400px' },
    );
    this.stripItems = this.items.map((file, i) => {
      const button = h('button', { class: 'lb-thumb', type: 'button', 'aria-label': `Zdjęcie ${i + 1}`, 'data-index': i, onclick: () => this.goTo(i) },
        h('img', { alt: '', draggable: 'false' }));
      this.stripObserver.observe(button);
      return button;
    });
    this.strip.append(...this.stripItems);
  }

  markStrip(index) {
    if (!this.stripItems) return;
    this.strip.querySelector('.active')?.classList.remove('active');
    const current = this.stripItems[index];
    current.classList.add('active');
    const target = current.offsetLeft - (this.strip.clientWidth - current.offsetWidth) / 2;
    this.strip.scrollTo({ left: target, behavior: this.strip.scrollLeft ? 'smooth' : 'instant' });
  }

  // --- pokaz slajdów ---
  play() {
    if (!this.isOpen()) return;
    this.playing = true;
    this.playBtn.replaceChildren(icon('pause'));
    this.playBtn.title = 'Zatrzymaj pokaz';
    this.playBtn.setAttribute('aria-label', 'Zatrzymaj pokaz');
    this.restartTimer();
  }

  pause() {
    this.playing = false;
    clearInterval(this.timer);
    if (!this.playBtn) return;
    this.playBtn.replaceChildren(icon('play'));
    this.playBtn.title = 'Pokaz slajdów';
    this.playBtn.setAttribute('aria-label', 'Pokaz slajdów');
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  restartTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.go(1, { fromTimer: true }), SLIDE_MS);
  }

  async download() {
    const file = this.items[this.index];
    if (!file) return;
    this.downloadBtn.disabled = true;
    toast('Pobieranie oryginału…');
    try {
      const blob = await images.originalBlob(file);
      const url = URL.createObjectURL(blob);
      const link = h('a', { href: url, download: file.name, hidden: true });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast('Nie udało się pobrać zdjęcia.');
    } finally {
      this.downloadBtn.disabled = false;
    }
  }

  // --- przybliżanie ---
  imageBox() {
    const box = this.frame.getBoundingClientRect();
    const img = this.full.naturalWidth ? this.full : this.low;
    if (!img.naturalWidth) return box;
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
  }

  isOnImage(x, y) {
    const box = this.imageBox();
    return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;
  }

  // Ustawia przybliżenie tak, żeby punkt (x, y) ekranu został w miejscu.
  // `fixed` to punkt zdjęcia trzymany pod palcami przy gestach dwoma palcami.
  setZoom(zoom, x, y, fixed = null) {
    zoom = Math.min(MAX_ZOOM, Math.max(1, zoom));
    if (this.zoom === 1) {
      if (zoom <= 1.01) return;
      this.base = { frame: this.frame.getBoundingClientRect(), img: this.imageBox() };
    }
    const { frame } = this.base;
    const cx = frame.left + frame.width / 2;
    const cy = frame.top + frame.height / 2;
    const point = fixed ?? { x: (x - cx - this.pan.x) / this.zoom, y: (y - cy - this.pan.y) / this.zoom };
    this.zoom = zoom;
    this.pan = this.clampPan(x - cx - zoom * point.x, y - cy - zoom * point.y);
    this.el.classList.add('is-zoomed');
    this.applyZoom();
    if (zoom > 1.3) this.loadOriginal();
  }

  toggleZoom(x, y) {
    if (this.zoom > 1) return this.resetZoom();
    if (!this.isOnImage(x, y)) return;
    this.setZoom(TAP_ZOOM, x, y);
  }

  clampPan(x, y) {
    const { frame, img } = this.base;
    const maxX = Math.max(0, (img.width * this.zoom - frame.width) / 2);
    const maxY = Math.max(0, (img.height * this.zoom - frame.height) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  applyZoom() {
    this.frame.style.transform = `translate3d(${this.pan.x}px, ${this.pan.y}px, 0) scale(${this.zoom})`;
  }

  resetZoom() {
    if (!this.el?.classList.contains('is-zoomed')) return;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.el.classList.remove('is-zoomed');
    this.frame.style.transform = '';
  }

  onWheel(e) {
    if (this.zoom === 1 && !this.isOnImage(e.clientX, e.clientY)) return;
    e.preventDefault();
    this.frame.classList.add('no-anim');
    const zoom = this.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    if (zoom <= 1.02) {
      this.frame.classList.remove('no-anim');
      this.resetZoom();
    } else {
      this.setZoom(zoom, e.clientX, e.clientY);
    }
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => this.frame.classList.remove('no-anim'), 150);
  }

  // --- gesty ---
  bindPointer() {
    const stage = this.stage;
    const pointers = new Map();
    let start = null;
    let axis = null;
    let moved = false;
    let pinch = null;

    const center = () => {
      const [a, b] = [...pointers.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
    };

    const beginPinch = () => {
      if (this.zoom === 1) this.frame.style.transform = ''; // przerwane przesuwanie jednym palcem
      const c = center();
      const frame = this.zoom > 1 ? this.base.frame : this.frame.getBoundingClientRect();
      const cx = frame.left + frame.width / 2;
      const cy = frame.top + frame.height / 2;
      pinch = {
        distance: Math.max(1, c.distance),
        zoom: this.zoom,
        point: { x: (c.x - cx - this.pan.x) / this.zoom, y: (c.y - cy - this.pan.y) / this.zoom },
      };
      this.frame.style.opacity = '';
      this.el.style.removeProperty('--lb-fade');
      this.frame.classList.add('no-anim');
    };

    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('a, button')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stage.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        moved = true;
        start = null;
        beginPinch();
        return;
      }
      if (pointers.size > 2) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now(), pan: { ...this.pan } };
      axis = null;
      moved = false;
    });

    stage.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const c = center();
        this.setZoom((pinch.zoom * c.distance) / pinch.distance, c.x, c.y, pinch.point);
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 8) return;
      moved = true;
      this.frame.classList.add('no-anim');
      if (this.zoom > 1) {
        this.pan = this.clampPan(start.pan.x + dx, start.pan.y + dy);
        this.applyZoom();
        return;
      }
      axis ??= Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'x') {
        this.frame.style.transform = `translate3d(${dx}px, 0, 0)`;
      } else if (dy > 0) {
        this.frame.style.transform = `translate3d(0, ${dy}px, 0) scale(${1 - Math.min(dy / 2000, 0.12)})`;
        this.el.style.setProperty('--lb-fade', String(1 - Math.min(dy / 500, 0.6)));
      }
    });

    const finish = (e, cancelled = false) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pinch) {
        if (pointers.size >= 2) return;
        pinch = null;
        this.frame.classList.remove('no-anim');
        if (this.zoom < 1.05) this.resetZoom();
        // Jeden palec został na ekranie — dalej przesuwa przybliżone zdjęcie.
        const [rest] = pointers.values();
        start = rest ? { x: rest.x, y: rest.y, t: performance.now(), pan: { ...this.pan } } : null;
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = Math.max(1, performance.now() - start.t);
      start = null;
      this.frame.classList.remove('no-anim');
      this.el.style.removeProperty('--lb-fade');
      if (cancelled) {
        if (this.zoom === 1) this.frame.style.transform = '';
        return;
      }
      if (!moved) return this.tap(e);
      if (this.zoom > 1) return;
      const flick = Math.abs(dx) / dt > 0.5 && Math.abs(dx) > 30;
      if (axis === 'x' && (Math.abs(dx) > 80 || flick)) return this.slideOut(dx < 0 ? 1 : -1);
      if (axis === 'y' && dy > 110) return this.requestClose();
      this.frame.style.transform = '';
    };

    stage.addEventListener('pointerup', (e) => finish(e));
    stage.addEventListener('pointercancel', (e) => finish(e, true));
  }

  tap(e) {
    const now = performance.now();
    const { clientX: x, clientY: y, pointerType } = e;
    if (now - this.lastTap < 300) {
      clearTimeout(this.tapTimer);
      this.lastTap = 0;
      this.toggleZoom(x, y);
      return;
    }
    this.lastTap = now;
    this.tapTimer = setTimeout(() => {
      if (pointerType === 'mouse' && this.zoom === 1 && !this.isOnImage(x, y)) this.requestClose();
      else this.el.classList.toggle('chrome-hidden');
    }, 260);
  }

  onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const box = this.frame.getBoundingClientRect();
    switch (e.key) {
      case 'ArrowRight':
        this.go(1);
        break;
      case 'ArrowLeft':
        this.go(-1);
        break;
      case '+':
      case '=':
        this.setZoom(this.zoom * 1.5, box.left + box.width / 2, box.top + box.height / 2);
        break;
      case '-':
        if (this.zoom / 1.5 <= 1.05) this.resetZoom();
        else this.setZoom(this.zoom / 1.5, box.left + box.width / 2, box.top + box.height / 2);
        break;
      case 'Escape':
        if (this.zoom > 1) this.resetZoom();
        else this.requestClose();
        break;
      case 'Tab':
        this.trapFocus(e);
        return;
      default:
        return;
    }
    e.preventDefault();
  }

  trapFocus(e) {
    const focusable = [...this.el.querySelectorAll('button:not([disabled]), a[href]')].filter((n) => n.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!this.el.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

export const lightbox = new Lightbox();
