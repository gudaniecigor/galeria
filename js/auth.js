import { CONFIG } from './config.js';

// Tylko odczyt — strona nie może niczego zmienić ani usunąć na Dysku.
export const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const STORAGE_KEY = 'galeria.session';

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
  persist();
  settle(session);
}

// Musi być wywołane od razu w obsłudze kliknięcia — inaczej przeglądarka zablokuje okno logowania.
// `reauth` odnawia sesję tego samego konta bez ponownego wybierania konta.
export function signIn({ reauth = false } = {}) {
  if (!client) return Promise.reject(new AuthError('load', 'Logowanie jeszcze się ładuje — spróbuj za chwilę.'));
  settle(new AuthError('superseded', 'Przerwano poprzednie logowanie.'));
  if (!reauth) session = null;
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    client.requestAccessToken(reauth ? { prompt: '', login_hint: session?.user?.email } : {});
  });
}

export function token() {
  return session && Date.now() < session.expiresAt ? session.token : null;
}

export function invalidate() {
  if (!session) return;
  session.expiresAt = 0;
  persist();
}

export const user = () => session?.user ?? null;

export function setUser(value) {
  if (!session) return;
  session.user = value;
  persist();
}

// Sesja przeżywa odświeżenie strony, ale znika po zamknięciu karty.
export function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.token && saved.user && saved.expiresAt > Date.now()) session = saved;
  } catch {
    session = null;
  }
  return session !== null;
}

function persist() {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage niedostępny (np. tryb prywatny) — sesja zostaje tylko w pamięci
  }
}

export function signOut() {
  const current = session?.token;
  session = null;
  persist();
  // Unieważnia token i zgodę po stronie Google.
  if (current && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(current, () => {});
}
