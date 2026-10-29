// Zapamiętuje pliki strony w urządzeniu: galeria startuje od razu, bez czekania na GitHub,
// a nowa wersja pobiera się w tle (strona pokazuje wtedy „Odśwież”).
// Zdjęcia i zapytania do Google nie przechodzą przez ten plik.
const CACHE = 'galeria-strona-v1';
const SKIP = ['/dev/'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('galeria-strona-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || SKIP.some((part) => url.pathname.includes(part))) return;
  event.respondWith(serve(event));
});

async function serve(event) {
  const cache = await caches.open(CACHE);
  // Wszystkie adresy strony (#/f/…, ?parametry) to ten sam plik index.html.
  const key = event.request.mode === 'navigate' ? new URL('./', self.location).href : event.request.url;
  const cached = await cache.match(key, { ignoreSearch: event.request.mode === 'navigate' });
  const previous = cached?.clone(); // kopia do porównania — oryginał od razu trafia do strony

  const fresh = fetch(event.request, { cache: 'no-cache' })
    .then(async (response) => {
      if (response.ok && response.type === 'basic') {
        const changed = previous && (await differs(previous, response.clone()));
        await cache.put(key, response.clone());
        if (changed) announceUpdate();
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(fresh);
    return cached;
  }
  return (await fresh) ?? Response.error();
}

async function differs(a, b) {
  const tag = (r) => r.headers.get('etag') || r.headers.get('last-modified');
  if (tag(a) && tag(b)) return tag(a) !== tag(b);
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  if (x.byteLength !== y.byteLength) return true;
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return true;
  return false;
}

let announceTimer = 0;
function announceUpdate() {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(async () => {
    for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'update' });
  }, 1500);
}
