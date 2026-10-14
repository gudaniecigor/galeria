import * as drive from './drive.js';
import * as images from './images.js';
import { formatTaken } from './dates.js';
import { h, icon, toast } from './ui.js';

const SLIDE_MS = 4500;
const ZOOM = 2.5;

function iconButton(name, label, onClick, extraClass = '') {
  return h('button', { class: `icon-btn ${extraClass}`, type: 'button', title: label, 'aria-label': label, onclick: onClick }, icon(name));
}

// Pełnoekranowy podgląd: strzałki / przesuwanie palcem, dwuklik = przybliżenie,
// przeciągnięcie w dół = zamknięcie, pokaz slajdów, pobieranie oryginału.
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

  build() {
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

    this.el = h('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Podgląd zdjęcia', hidden: true },
      this.stage,
      h('div', { class: 'lb-top' }, this.counter, h('div', { class: 'lb-actions' }, this.playBtn, this.downloadBtn, this.driveLink, this.closeBtn)),
      this.prevBtn,
      this.nextBtn,
      h('div', { class: 'lb-bottom' }, this.caption));
    document.body.append(this.el);

    this.full.addEventListener('load', () => {
      this.frame.classList.add('is-full');
      this.spinner.hidden = true;
    });
    this.full.addEventListener('error', () => {
      if (this.full.getAttribute('src')) this.fail(true);
    });
    this.onKey = this.onKey.bind(this);
    this.bindPointer();
  }

  isOpen() {
    return Boolean(this.el && !this.el.hidden);
  }

  open(items, index, handlers = {}) {
    if (!this.el) this.build();
    this.items = items;
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
    const low = images.peekThumb(file);
    if (low) this.low.src = low;
    else this.low.removeAttribute('src');

    this.counter.textContent = `${index + 1} / ${this.items.length}`;
    const when = formatTaken(file);
    this.caption.replaceChildren(when ? h('span', { class: 'lb-date' }, when) : '', h('span', { class: 'lb-name' }, file.name));
    this.driveLink.href = file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;
    this.prevBtn.disabled = index === 0;
    this.nextBtn.disabled = index === this.items.length - 1;
    this.enter(direction);

    images.fullUrl(file).then(
      (url) => {
        if (seq === this.seq) this.full.src = url;
      },
      () => {
        if (seq === this.seq) this.fail(false);
      },
    );
    for (const neighbour of [index + 1, index - 1]) {
      if (this.items[neighbour]) images.fullUrl(this.items[neighbour]).catch(() => {});
    }
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
        ? 'Ta przeglądarka nie potrafi wyświetlić tego formatu zdjęcia (np. HEIC z iPhone’a).'
        : 'Nie udało się wczytać zdjęcia.'),
      h('a', { class: 'btn', href: this.driveLink.href, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 16), 'Otwórz w Dysku Google'));
  }

  go(delta, { fromTimer = false } = {}) {
    let next = this.index + delta;
    if (fromTimer && next >= this.items.length) next = 0;
    if (next < 0 || next >= this.items.length) return this.bump(delta);
    if (!fromTimer && this.playing) this.restartTimer();
    if (this.handlers.onChange) this.handlers.onChange(next);
    else this.show(next);
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
      const blob = await drive.download(file.id);
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

  toggleZoom(x, y) {
    if (this.zoom > 1) return this.resetZoom();
    if (!this.isOnImage(x, y)) return;
    const frame = this.frame.getBoundingClientRect();
    this.base = { frame, img: this.imageBox() };
    this.zoom = ZOOM;
    const cx = frame.left + frame.width / 2;
    const cy = frame.top + frame.height / 2;
    this.pan = this.clampPan((cx - x) * (ZOOM - 1), (cy - y) * (ZOOM - 1));
    this.el.classList.add('is-zoomed');
    this.applyZoom();
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
    if (this.zoom === 1) return;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.el.classList.remove('is-zoomed');
    this.frame.style.transform = '';
  }

  // --- gesty ---
  bindPointer() {
    const stage = this.stage;
    let start = null;
    let axis = null;
    let moved = false;

    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('a, button')) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now(), pan: { ...this.pan } };
      axis = null;
      moved = false;
      stage.setPointerCapture(e.pointerId);
    });

    stage.addEventListener('pointermove', (e) => {
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
    switch (e.key) {
      case 'ArrowRight':
        this.go(1);
        break;
      case 'ArrowLeft':
        this.go(-1);
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
