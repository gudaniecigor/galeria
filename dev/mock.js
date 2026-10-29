// Udawane Google Identity Services + Google Drive API — tylko do testów (dev/serve.mjs).
// Parametry adresu: ?links (miniatury Google działają), ?exif (JPG z miniaturką EXIF),
// ?delay=ms, ?expires=s (ważność tokenu), ?noaccess
(() => {
  const ROOT = 'ROOTFOLDER_mock_0001';
  const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
  const params = new URLSearchParams(location.search);
  const LINKS = params.has('links');
  const EXIF = params.has('exif');
  const DELAY = Number(params.get('delay') ?? 150);
  const EXPIRES = Number(params.get('expires') ?? 3600);
  const NOACCESS = params.has('noaccess');
  const log = (window.__mockLog = []);

  window.google = {
    accounts: {
      oauth2: {
        initTokenClient(cfg) {
          return {
            requestAccessToken(opts) {
              log.push(['requestAccessToken', JSON.stringify(opts ?? {})]);
              setTimeout(() => cfg.callback({ access_token: `mock-${Date.now()}`, expires_in: EXPIRES, scope: SCOPE }), 250);
            },
          };
        },
        hasGrantedAllScopes: () => true,
        revoke: (token, cb) => {
          log.push(['revoke', token]);
          cb?.();
        },
      },
    },
  };

  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const files = new Map();
  let counter = 0;
  const nextId = (prefix) => `${prefix}_${String(++counter).padStart(8, '0')}x`;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  files.set(ROOT, { id: ROOT, name: 'Galeria', mimeType: 'application/vnd.google-apps.folder', parents: ['MYDRIVE_root_000'] });

  const today = new Date();
  const yearsAgo = (n) => new Date(today.getFullYear() - n, today.getMonth(), today.getDate());

  // [nazwa, liczba zdjęć, okładka?]
  const FOLDERS = [
    ['2025-09-20', 18], ['2025-08-14 Wakacje nad morzem', 42, true], ['2025-07-02', 9], ['15.06.2025', 14],
    ['2025-05-03 Majówka', 23], ['2025-03-08', 6], ['2025-01-01 Sylwester', 11],
    [`${iso(yearsAgo(1))} Rok temu`, 7], ['2024-12-24 Wigilia', 27], ['2024-10-12', 8], ['2024-08-30', 12],
    ['2024-08-01 Mazury', 35], ['2024-06-15', 10], ['2024-05', 7], ['2024-04-20', 16], ['2024-02-14', 5],
    [iso(yearsAgo(3)), 4], ['2023-12-31', 13], ['2023-09-09', 9], ['2023-07-21 Chorwacja', 30], ['2023-05-27', 4],
    ['2023-01-15', 0], ['Różne', 12], ['<img src=x onerror=alert(1)> test', 2],
  ];
  const RATIOS = [[3, 2], [3, 2], [2, 3], [3, 2], [4, 3], [16, 9], [1, 1]];

  function addFolder(name, parent) {
    const id = nextId('FOLDER');
    files.set(id, { id, name, mimeType: 'application/vnd.google-apps.folder', parents: [parent], createdTime: '2025-01-01T10:00:00Z', modifiedTime: '2025-01-01T10:00:00Z' });
    return id;
  }

  function addImage(parent, name, ratio, time, extra = {}) {
    const [rw, rh] = ratio;
    const width = rw >= rh ? 6048 : Math.round((6048 * rw) / rh);
    const height = rw >= rh ? Math.round((6048 * rh) / rw) : 6048;
    const id = nextId('IMG');
    files.set(id, {
      id,
      name,
      mimeType: 'image/jpeg',
      parents: [parent],
      thumbnailLink: `https://lh3.googleusercontent.com/drive-storage/mock-${id}=s220`,
      webViewLink: `https://drive.google.com/file/d/${id}/view`,
      createdTime: '2025-10-01T10:00:00Z',
      modifiedTime: '2025-10-01T10:00:00Z',
      md5Checksum: `md5${id}`,
      imageMediaMetadata: time
        ? { width, height, rotation: 0, time: `${time.getFullYear()}:${pad(time.getMonth() + 1)}:${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}:00` }
        : { width, height },
      hue: Math.floor(rand() * 360),
      ...extra,
    });
    return id;
  }

  function addImages(parent, count, baseDate) {
    for (let i = 0; i < count; i++) {
      const ratio = RATIOS[Math.floor(rand() * RATIOS.length)];
      const time = i % 9 === 8 ? null : new Date(baseDate.getTime() + (8 + rand() * 12) * 3600e3 + i * 60e3);
      addImage(parent, `DSC_${String(1000 + counter).padStart(4, '0')}.jpg`, ratio, time);
    }
  }

  for (const [name, count, cover] of FOLDERS) {
    const folderId = addFolder(name, ROOT);
    const m = name.match(/(\d{4})-(\d{2})(?:-(\d{2}))?/) || name.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    const date = m ? (m[3]?.length === 4 ? new Date(+m[3], m[2] - 1, +m[1]) : new Date(+m[1], m[2] - 1, +(m[3] || 1))) : new Date(2022, 5, 1);
    addImages(folderId, count, date);
    if (cover) addImage(folderId, 'okladka.jpg', [3, 2], null, { hue: 45, cover: true });
    if (name.includes('Chorwacja')) addImages(addFolder('Dzień 2 — Split', folderId), 8, new Date(2023, 6, 22));
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const pick = ({ hue, cover, ...rest }) => rest;
  const rendered = new Map();

  function toBlob(canvas, quality = 0.85) {
    return new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  }

  function draw(file, maxSide) {
    const meta = file.imageMediaMetadata;
    const scale = Math.min(1, maxSide / Math.max(meta.width, meta.height));
    const w = Math.round(meta.width * scale);
    const h = Math.round(meta.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${file.hue} 60% 70%)`);
    g.addColorStop(0.6, `hsl(${(file.hue + 30) % 360} 55% 45%)`);
    g.addColorStop(1, `hsl(${(file.hue + 60) % 360} 45% 20%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `hsl(${(file.hue + 180) % 360} 80% 85% / .85)`;
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.3, Math.min(w, h) * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsl(${(file.hue + 90) % 360} 35% 18% / .9)`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.7);
    ctx.lineTo(w * 0.3, h * 0.5);
    ctx.lineTo(w * 0.55, h * 0.68);
    ctx.lineTo(w * 0.8, h * 0.45);
    ctx.lineTo(w, h * 0.62);
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.font = `${Math.round(Math.min(w, h) * 0.06)}px sans-serif`;
    ctx.fillText(file.cover ? 'OKŁADKA' : file.name, w * 0.05, h * 0.92);
    return canvas;
  }

  // Segment APP1 z miniaturką EXIF (IFD1), tak jak zapisują ją aparaty.
  function exifSegment(thumb) {
    const tiffLength = 44 + thumb.length;
    const seg = new Uint8Array(2 + 2 + 6 + tiffLength);
    const view = new DataView(seg.buffer);
    seg.set([0xff, 0xe1], 0);
    view.setUint16(2, 2 + 6 + tiffLength);
    seg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
    const t = 10;
    seg.set([0x49, 0x49, 0x2a, 0x00], t);
    view.setUint32(t + 4, 8, true);
    view.setUint16(t + 8, 0, true); // IFD0: 0 wpisów
    view.setUint32(t + 10, 14, true); // -> IFD1
    view.setUint16(t + 14, 2, true);
    const entry = (at, tag, value) => {
      view.setUint16(t + at, tag, true);
      view.setUint16(t + at + 2, 4, true);
      view.setUint32(t + at + 4, 1, true);
      view.setUint32(t + at + 8, value, true);
    };
    entry(16, 0x0201, 44);
    entry(28, 0x0202, thumb.length);
    view.setUint32(t + 40, 0, true);
    seg.set(thumb, t + 44);
    return seg;
  }

  async function media(file, maxSide) {
    const key = `${file.id}:${maxSide}`;
    if (!rendered.has(key)) {
      rendered.set(key, (async () => {
        const main = new Uint8Array(await (await toBlob(draw(file, maxSide))).arrayBuffer());
        if (!EXIF || maxSide < 4000) return new Blob([main], { type: 'image/jpeg' });
        const thumb = new Uint8Array(await (await toBlob(draw(file, 160), 0.7)).arrayBuffer());
        return new Blob([main.slice(0, 2), exifSegment(thumb), main.slice(2)], { type: 'image/jpeg' });
      })());
    }
    return rendered.get(key);
  }

  async function api(url, init) {
    const headers = new Headers(init.headers || {});
    if (!(headers.get('Authorization') || '').startsWith('Bearer mock-')) return json({ error: { code: 401 } }, 401);
    const path = url.pathname.replace('/drive/v3', '');
    log.push(['api', path + url.search]);

    if (path === '/about') return json({ user: { displayName: 'Igor Testowy', emailAddress: 'igor@example.com' } });

    if (path === '/files') {
      const parent = url.searchParams.get('q').match(/'([\w-]+)' in parents/)[1];
      if (NOACCESS) return json({ files: [] });
      const all = [...files.values()].filter((f) => f.parents?.includes(parent));
      const size = 25;
      const offset = Number(url.searchParams.get('pageToken') || 0);
      const page = all.slice(offset, offset + size).map(pick);
      return json({ files: page, ...(offset + size < all.length ? { nextPageToken: String(offset + size) } : {}) });
    }

    const m = path.match(/^\/files\/([\w-]+)$/);
    if (m) {
      const file = files.get(m[1]);
      if (!file || (NOACCESS && m[1] === ROOT)) return json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, 404);
      if (url.searchParams.get('alt') !== 'media') return json(pick(file));
      const blob = await media(file, 4000);
      const range = headers.get('Range')?.match(/bytes=(\d+)-(\d+)/);
      if (range) {
        log.push(['range', file.id]);
        return new Response(blob.slice(+range[1], +range[2] + 1), { status: 206, headers: { 'Content-Type': 'image/jpeg' } });
      }
      log.push(['media', file.id]);
      await sleep(DELAY);
      return new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } });
    }
    return json({ error: { code: 404 } }, 404);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.href ?? input.url, location.href);
    if (url.host === 'www.googleapis.com') {
      await sleep(DELAY * (0.5 + rand()));
      return api(url, init);
    }
    if (url.host === 'lh3.googleusercontent.com') {
      log.push(['thumb', url.pathname]);
      if (!LINKS) return new Response('Forbidden', { status: 403 });
      const [, id, size] = url.pathname.match(/mock-([\w-]+)=s(\d+)/);
      return new Response(await media(files.get(id), Number(size)), { headers: { 'Content-Type': 'image/jpeg' } });
    }
    return realFetch(input, init);
  };
})();
