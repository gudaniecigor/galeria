import { CONFIG } from './config.js';
import * as auth from './auth.js';
import * as data from './data.js';
import * as drive from './drive.js';
import * as images from './images.js';
import { createFolderView } from './folder-view.js';
import { lightbox } from './lightbox.js';
import { errorPage, loadingPage, loginPage, noAccessPage, reauthDialog, setupPage } from './pages.js';
import { h, icon } from './ui.js';

const ROOT = CONFIG.rootFolderId;
const app = document.getElementById('app');
const MAX_VIEWS = 6;

let shell = null;
let current = { folder: null, photo: null };
let currentView = null;
let views = new Map();
let lightboxPushed = false;
let enteredFromParent = false;
let autoplay = false;
let reauthPromise = null;

document.title = CONFIG.title;
history.scrollRestoration = 'manual';

// --- adresy: #/  ·  #/p/<zdjęcie>  ·  #/f/<folder>  ·  #/f/<folder>/p/<zdjęcie> ---
const folderHref = (id) => (id === ROOT ? '#/' : `#/f/${id}`);
const photoHref = (folderId, fileId) => `${folderId === ROOT ? '#/' : `#/f/${folderId}/`}p/${fileId}`;

function parseRoute() {
  const m = location.hash.match(/^#\/(?:f\/([\w-]+)\/?)?(?:p\/([\w-]+))?\/?$/);
  return { folder: m?.[1] || ROOT, photo: m?.[2] || null };
}

const isConfigured = () =>
  !/WKLEJ/.test(CONFIG.clientId + ROOT) && /\.apps\.googleusercontent\.com$/.test(CONFIG.clientId) && drive.isValidId(ROOT);

function boot() {
  if (!isConfigured()) {
    app.replaceChildren(setupPage());
    return;
  }
  drive.onAuthRequired(reauthenticate);
  window.addEventListener('hashchange', () => {
    if (shell) route();
  });
  const ready = auth.init();
  if (auth.restore()) enter();
  else showLogin(ready);
}

function showLogin(ready = auth.init()) {
  app.replaceChildren(
    loginPage({
      ready,
      account: auth.rememberedAccount(),
      onLogin: async (chooseAccount) => {
        await auth.signIn({ chooseAccount });
        const user = await drive.about();
        await images.useStorageFor(user.email);
        auth.setUser(user);
        await enter();
      },
    }),
  );
}

async function enter() {
  app.replaceChildren(loadingPage());
  // Prośba, by przeglądarka nie usuwała zapamiętanych miniatur przy braku miejsca.
  navigator.storage?.persist?.().catch(() => {});
  try {
    await data.checkRoot();
  } catch (err) {
    if (err.status === 404 || err.status === 403) {
      app.replaceChildren(noAccessPage({ email: auth.user()?.email, onLogout: () => logout({ forget: true }) }));
    } else {
      app.replaceChildren(errorPage(err, enter));
    }
    return;
  }
  mountShell();
  route();
}

function avatar(user) {
  const initial = h('span', { class: 'avatar' }, (user.name || user.email || '?').charAt(0).toUpperCase());
  if (!user.photo) return initial;
  const img = h('img', { class: 'avatar', src: user.photo, alt: '', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(initial), { once: true });
  return img;
}

function mountShell() {
  const user = auth.user() ?? {};
  const back = h('button', { class: 'icon-btn back', type: 'button', title: 'Wróć', 'aria-label': 'Wróć', onclick: goBack }, icon('back'));
  const bar = h('header', { class: 'topbar' },
    back,
    h('a', { class: 'brand', href: '#/' }, CONFIG.title),
    h('div', { class: 'spacer' }),
    h('div', { class: 'user', title: user.email || '' }, avatar(user), h('span', { class: 'user-name' }, user.name || user.email || '')),
    h('button', { class: 'icon-btn', type: 'button', title: 'Wyloguj', 'aria-label': 'Wyloguj', onclick: logout }, icon('logout')));
  const main = h('div', { class: 'view' });
  app.replaceChildren(bar, main);
  shell = { bar, back, main };
}

function viewFor(id) {
  let view = views.get(id);
  if (view) {
    views.delete(id);
    views.set(id, view);
    return view;
  }
  view = createFolderView(id, {
    isRoot: id === ROOT,
    folderHref,
    photoHref,
    onSlideshow: (folder) => {
      autoplay = true;
      location.assign(photoHref(folder.id, folder.images[0].id));
    },
    onRetry: () => {
      view.destroy();
      views.delete(id);
      current = { folder: null, photo: null };
      route();
    },
  });
  views.set(id, view);
  for (const [key, old] of views) {
    if (views.size <= MAX_VIEWS) break;
    if (key !== ROOT && old !== view) {
      old.destroy();
      views.delete(key);
    }
  }
  return view;
}

async function route() {
  const next = parseRoute();
  const prev = current;
  current = next;

  if (next.folder !== prev.folder) {
    if (currentView) currentView.scrollY = window.scrollY;
    enteredFromParent = prev.folder !== null && data.parentOf(next.folder) === prev.folder;
    currentView = viewFor(next.folder);
    shell.main.replaceChildren(currentView.el);
    shell.back.hidden = next.folder === ROOT;
    window.scrollTo(0, currentView.scrollY);
  }

  if (!next.photo) {
    lightbox.close();
    return;
  }
  if (!prev.photo) lightboxPushed = prev.folder === next.folder;

  let folder;
  try {
    folder = await currentView.ready;
  } catch {
    return; // widok sam pokazuje błąd
  }
  if (current !== next) return;

  const index = folder.images.findIndex((file) => file.id === next.photo);
  if (index < 0) {
    location.replace(folderHref(next.folder));
    return;
  }
  lightbox.open(folder.images, index, {
    onChange: (i) => location.replace(photoHref(folder.id, folder.images[i].id)),
    onClose: closePhoto,
  });
  if (autoplay) {
    autoplay = false;
    lightbox.play();
  }
}

function closePhoto() {
  if (lightboxPushed) history.back();
  else location.replace(folderHref(current.folder));
}

function goBack() {
  if (enteredFromParent) history.back();
  else location.assign(folderHref(data.parentOf(current.folder) ?? ROOT));
}

// Token Google wygasa po ok. godzinie — wtedy wstrzymujemy zapytania i prosimy o jedno kliknięcie.
function reauthenticate() {
  reauthPromise ??= new Promise((resolve) => {
    const dialog = reauthDialog({
      email: auth.user()?.email,
      onContinue: async () => {
        await auth.signIn({ reauth: true });
        dialog.remove();
        reauthPromise = null;
        resolve();
      },
      onLogout: () => {
        dialog.remove();
        reauthPromise = null;
        logout();
      },
    });
    document.body.append(dialog);
  });
  return reauthPromise;
}

// Zapamiętane miniatury zostają w przeglądarce — kolejne logowanie od razu pokaże galerię.
// „Zaloguj się innym kontem” dodatkowo zapomina konto, cofa zgodę i kasuje zapamiętane zdjęcia.
function logout({ forget = false } = {}) {
  lightbox.close();
  auth.signOut({ revoke: forget });
  if (forget) {
    auth.forgetAccount();
    images.clearStored();
  }
  for (const view of views.values()) view.destroy();
  views = new Map();
  currentView = null;
  shell = null;
  current = { folder: null, photo: null };
  data.reset();
  images.releaseMemory();
  history.replaceState(null, '', location.pathname + location.search);
  showLogin();
}

boot();
