import { CONFIG } from './config.js';

// Tylko odczyt — strona nie może niczego zmienić ani usunąć na Dysku.
export const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SESSION_KEY = 'galeria.session';
const ACCOUNT_KEY = 'galeria.account';

let session = null; // { token, expiresAt, user }
let client = null;
let pending = null;
let ready = null;

export class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const MESSAGES = {
  popup_failed_to_open: 'Przeglądarka zablokowała okno logowania. Zezwól na wyskakujące okna dla tej strony i spróbuj ponownie.',
  popup_closed: 'Okno logowania zostało zamknięte.',
  access_denied: 'Logowanie zostało anulowane.',
  scope: 'Aby zobaczyć zdjęcia, zaznacz zgodę na wyświetlanie plików z Dysku Google.',
};
const message = (code) => MESSAGES[code] || 'Nie udało się zalogować. Spróbuj ponownie.';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage niedostępny (np. tryb prywatny) — sesja zostaje tylko w pamięci
  }
}

function loadScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new AuthError('load', 'Nie udało się połączyć z Google. Sprawdź internet albo wyłącz blokadę reklam dla tej strony.'));
    };
    document.head.append(script);
  });
}

// Ładuje Google Identity Services i przygotowuje klienta OAuth.
export function init() {
  ready ??= loadScript()
    .then(() => {
      client = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope: SCOPE,
        callback: handleToken,
        error_callback: (err) => settle(new AuthError(err.type, message(err.type))),
      });
    })
    .catch((err) => {
      ready = null;
      throw err;
    });
  return ready;
}

function settle(result) {
  const current = pending;
  pending = null;
  if (!current) return;
  if (result instanceof Error) current.reject(result);
  else current.resolve(result);
}

function handleToken(response) {
  if (response.error) return settle(new AuthError(response.error, message(response.error)));
  if (!google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
    return settle(new AuthError('scope', message('scope')));
  }
  session = {
    ...session,
    token: response.access_token,
    expiresAt: Date.now() + (Number(response.expires_in) || 3600) * 1000 - 60_000,
  };
  write(SESSION_KEY, session);
  settle(session);
}

// Konto zapamiętane z poprzedniego logowania — dzięki temu nie trzeba go wybierać.
export const rememberedAccount = () => read(ACCOUNT_KEY);

export function forgetAccount() {
  write(ACCOUNT_KEY, null);
}

// Musi być wywołane od razu w obsłudze kliknięcia — inaczej przeglądarka zablokuje okno logowania.
// Przy zapamiętanym koncie okno Google tylko mignie; `chooseAccount` wymusza wybór konta.
export function signIn({ reauth = false, chooseAccount = false } = {}) {
  if (!client) return Promise.reject(new AuthError('load', 'Logowanie jeszcze się ładuje — spróbuj za chwilę.'));
  settle(new AuthError('superseded', 'Przerwano poprzednie logowanie.'));
  const hint = session?.user?.email ?? rememberedAccount();
  if (!reauth) session = null;
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    client.requestAccessToken(hint && !chooseAccount ? { prompt: '', login_hint: hint } : { prompt: 'select_account' });
  });
}

export function token() {
  return session && Date.now() < session.expiresAt ? session.token : null;
}

export function invalidate() {
  if (!session) return;
  session.expiresAt = 0;
  write(SESSION_KEY, session);
}

export const user = () => session?.user ?? null;

export function setUser(value) {
  if (!session) return;
  session.user = value;
  write(SESSION_KEY, session);
  write(ACCOUNT_KEY, value.email);
}

// Sesja przeżywa zamknięcie karty i przeglądarki, ale token Google i tak wygasa po ok. godzinie.
export function restore() {
  const saved = read(SESSION_KEY);
  session = saved?.token && saved.user && saved.expiresAt > Date.now() ? saved : null;
  return session !== null;
}

// Zwykłe wylogowanie usuwa token z przeglądarki (i tak wygasa po godzinie), ale zostawia zgodę
// w Google — inaczej przy każdym logowaniu trzeba by ją od nowa potwierdzać.
// `revoke` (przy zmianie konta) cofa też zgodę po stronie Google.
export function signOut({ revoke = false } = {}) {
  const current = session?.token;
  session = null;
  write(SESSION_KEY, null);
  if (revoke && current && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(current, () => {});
}
