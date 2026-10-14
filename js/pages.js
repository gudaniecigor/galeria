import { CONFIG } from './config.js';
import { googleLogo, h, icon } from './ui.js';

// Kolorowe „odbitki” w tle ekranu logowania — czysta dekoracja, bez prawdziwych zdjęć.
const PALETTE = [
  ['#f4a261', '#e76f51'],
  ['#2a9d8f', '#264653'],
  ['#8ecae6', '#219ebc'],
  ['#90be6d', '#43aa8b'],
  ['#b5838d', '#6d6875'],
  ['#e9c46a', '#f4a261'],
  ['#3d5a80', '#293241'],
  ['#ffafcc', '#cdb4db'],
];

function backdrop() {
  const wrap = h('div', { class: 'login-bg', 'aria-hidden': 'true' });
  for (let i = 0; i < 35; i++) {
    const [from, to] = PALETTE[(i * 5 + (i >> 2)) % PALETTE.length];
    const card = h('span');
    card.style.background = `linear-gradient(${(i * 53) % 360}deg, ${from}, ${to})`;
    card.style.animationDelay = `${-((i * 1.7) % 16)}s`;
    wrap.append(card);
  }
  return wrap;
}

export function loginPage({ ready, onLogin }) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const button = h('button', { class: 'gbtn', type: 'button', disabled: true }, googleLogo(), h('span', {}, 'Zaloguj się przez Google'));

  ready.then(
    () => (button.disabled = false),
    (err) => (error.textContent = err.message),
  );

  button.addEventListener('click', async () => {
    error.textContent = '';
    button.disabled = true;
    try {
      await onLogin();
    } catch (err) {
      error.textContent = err.message || 'Nie udało się zalogować.';
    } finally {
      button.disabled = false;
    }
  });

  return h('div', { class: 'login' },
    backdrop(),
    h('div', { class: 'login-card' },
      h('div', { class: 'login-mark' }, icon('image', 26)),
      h('h1', {}, CONFIG.title),
      h('p', { class: 'login-sub' }, CONFIG.subtitle),
      button,
      error,
      h('p', { class: 'login-note' }, icon('lock', 14), h('span', {}, 'Dostęp tylko dla zaproszonych osób. Hasło wpisujesz bezpośrednio u Google — ta strona go nie widzi.'))));
}

function statePage({ iconName, title, body, actions = [] }) {
  return h('div', { class: 'state state-full' },
    h('div', { class: 'state-card' },
      h('div', { class: 'state-icon' }, icon(iconName, 24)),
      h('h1', {}, title),
      h('p', {}, body),
      actions.length ? h('div', { class: 'state-actions' }, actions) : null));
}

export function setupPage() {
  return statePage({
    iconName: 'sliders',
    title: 'Prawie gotowe',
    body: [
      'Uzupełnij plik ', h('code', {}, 'js/config.js'),
      ' — wklej Client ID z Google Cloud i ID folderu ze zdjęciami. Instrukcja krok po kroku jest w pliku ',
      h('code', {}, 'README.md'), '.',
    ],
  });
}

export function noAccessPage({ email, onLogout }) {
  return statePage({
    iconName: 'lock',
    title: 'Brak dostępu',
    body: [
      'Konto ', h('strong', {}, email || 'to'),
      ' nie ma dostępu do tej galerii. Poproś właściciela o udostępnienie folderu ze zdjęciami dla tego adresu.',
    ],
    actions: [h('button', { class: 'btn', type: 'button', onclick: onLogout }, 'Zaloguj się innym kontem')],
  });
}

export function errorPage(err, onRetry) {
  return statePage({
    iconName: 'alert',
    title: 'Coś poszło nie tak',
    body: err.message || 'Spróbuj ponownie za chwilę.',
    actions: [h('button', { class: 'btn', type: 'button', onclick: onRetry }, 'Spróbuj ponownie')],
  });
}

export function loadingPage() {
  return h('div', { class: 'state state-full' }, h('div', { class: 'spinner', role: 'status', 'aria-label': 'Ładowanie' }));
}

export function reauthDialog({ email, onContinue, onLogout }) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const proceed = h('button', { class: 'btn btn-primary', type: 'button' }, 'Kontynuuj');
  proceed.addEventListener('click', () => {
    error.textContent = '';
    onContinue().catch((err) => (error.textContent = err.message));
  });
  const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'reauth-title' },
    h('div', { class: 'modal-card' },
      h('div', { class: 'state-icon' }, icon('lock', 22)),
      h('h2', { id: 'reauth-title' }, 'Sesja wygasła'),
      h('p', {},
        'Ze względów bezpieczeństwa logowanie Google jest ważne przez około godzinę. Kliknij, aby kontynuować',
        email ? [' jako ', h('strong', {}, email)] : null, '.'),
      error,
      h('div', { class: 'state-actions' },
        proceed,
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: onLogout }, 'Wyloguj'))));
  queueMicrotask(() => proceed.focus());
  return dialog;
}
