# Galeria zdjęć z Dysku Google

Prywatna galeria na GitHub Pages. Po zalogowaniu kontem Google pokazuje foldery z Twojego Dysku jako kafelki (pogrupowane po latach), a po kliknięciu otwiera galerię zdjęć z podglądem na pełnym ekranie.

- logowanie przez Google (hasło i weryfikacja dwuetapowa po stronie Google)
- foldery z datami w nazwie (`2024-07-15`, `15.07.2024`, `15 lipca 2024 Wakacje`, `2024-07`…) są rozpoznawane, sortowane i grupowane po latach
- siatka zdjęć w stylu Zdjęć Google, podgląd pełnoekranowy, strzałki / przesuwanie palcem, dwuklik = przybliżenie, przeciągnięcie w dół = zamknięcie
- pokaz slajdów, pobieranie oryginału, link „Otwórz w Dysku Google”
- działa na telefonie i komputerze, bez serwera i bez żadnych kosztów

## Jak to jest zabezpieczone

- **Hasło wpisujesz tylko u Google.** Strona dostaje od Google jedynie krótkotrwały (ok. 1 h) klucz dostępu.
- **Zdjęcia zostają prywatne na Dysku.** Strona pokazuje tylko to, do czego zalogowane konto ma dostęp. Osoba bez dostępu nic nie zobaczy, nawet jeśli przeczyta cały kod strony.
- **Tylko odczyt.** Strona prosi o uprawnienie `drive.readonly`, więc nie może niczego zmienić ani usunąć.
- **W kodzie nie ma sekretów.** Client ID i ID folderu mogą być publiczne. Client ID działa wyłącznie z Twoim adresem `github.io`.
- **Podwójna bramka.** Zalogować się mogą tylko osoby dodane jako testerzy w Google Cloud, a zobaczyć zdjęcia tylko te, którym udostępnisz folder.
- Klucz dostępu znika po zamknięciu karty. „Wyloguj” unieważnia go u Google i czyści zapamiętane miniatury.
- Strona ma politykę bezpieczeństwa treści (CSP), która pozwala łączyć się tylko z Google.

---

## Konfiguracja krok po kroku (ok. 15 minut)

### 1. Przygotuj folder na Dysku

Masz już folder główny z folderami-datami w środku. Otwórz go na [drive.google.com](https://drive.google.com) i skopiuj jego ID z paska adresu:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
                                       └──────── to jest ID ────────┘
```

### 2. Wrzuć stronę na GitHub

1. Utwórz nowe repozytorium na GitHubie, np. `galeria`. Może być publiczne, bo w kodzie nie ma nic tajnego.
2. Wgraj do niego wszystkie pliki z tego folderu.
3. W repozytorium wejdź w **Settings → Pages**. W **Source** wybierz **Deploy from a branch**, branch `main`, folder `/ (root)` i kliknij **Save**.
4. Po minucie strona będzie pod adresem `https://TWOJ-LOGIN.github.io/galeria/`.

### 3. Skonfiguruj logowanie w Google Cloud

1. Wejdź na [console.cloud.google.com](https://console.cloud.google.com) i utwórz nowy projekt (wybór projektu u góry → **New project**), np. „Galeria”.
2. **Włącz Drive API:** menu → **APIs & Services → Library** → wyszukaj **Google Drive API** → **Enable**.
3. **Ekran zgody:** menu → **Google Auth Platform → Branding** → **Get started**:
   - App name: np. „Galeria”, User support email: Twój e-mail
   - Audience: **External**
   - Contact information: Twój e-mail → zaakceptuj zasady → **Create**
4. **Testerzy:** **Audience → Test users → Add users**. Dodaj swój adres Gmail i adresy osób z rodziny, które mają oglądać zdjęcia. Status publikacji zostaw na **Testing**.
5. **Uprawnienia:** **Data Access → Add or remove scopes**. Wyszukaj `drive.readonly` („See and download all your Google Drive files”), zaznacz go, kliknij **Update**, a potem **Save**.
6. **Client ID:** **Clients → Create client**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://TWOJ-LOGIN.github.io`, czyli sam adres, bez `/galeria` i bez ukośnika na końcu
   - Redirect URIs zostaw puste
   - **Create**, a potem skopiuj **Client ID** (kończy się na `.apps.googleusercontent.com`)

> Client secret nie jest potrzebny. Nigdzie go nie wklejaj.

### 4. Uzupełnij `js/config.js`

```js
clientId: '1234567890-abc...xyz.apps.googleusercontent.com',
rootFolderId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
title: 'Nasze zdjęcia',
```

Zapisz zmiany i wgraj plik na GitHuba. Po chwili strona będzie gotowa.

### 5. Dodaj rodzinę

Dla każdej osoby:

1. Na Dysku kliknij folder główny prawym przyciskiem → **Udostępnij** → wpisz jej adres Gmail → rola **Przeglądający**.
2. Dodaj ten sam adres w Google Cloud: **Audience → Test users**.

Przy pierwszym logowaniu Google pokaże komunikat „Google nie zweryfikował tej aplikacji”. To normalne dla prywatnych aplikacji: trzeba kliknąć **Kontynuuj** i zaznaczyć zgodę na dostęp do Dysku.

---

## Dobrze wiedzieć

- **Sesja trwa ok. godziny.** Potem pojawi się okienko „Sesja wygasła” i wystarczy kliknąć **Kontynuuj**.
- **Pierwsze otwarcie folderu może chwilę potrwać.** Google nie udostępnia gotowych miniatur prywatnych zdjęć innym stronom, więc galeria pobiera zdjęcia i sama robi miniatury. Potem zapamiętuje je w przeglądarce, więc kolejne wizyty są szybkie. Na komórkowym internecie warto pierwszy raz otworzyć galerię na Wi-Fi.
- **Zdjęcia HEIC z iPhone'a** wyświetlają się w Safari (iPhone, Mac). Chrome na Androidzie i Windowsie ich nie pokaże i wyświetli przycisk „Otwórz w Dysku Google”. Żeby iPhone zapisywał JPG: **Ustawienia → Aparat → Formaty → Najbardziej zgodny**.
- **Kolejność:** w `js/config.js` ustawisz, czy najnowsze dni mają być na górze (`folderOrder`) i czy zdjęcia mają być sortowane po dacie zrobienia, czy po nazwie (`photoOrder`).
- **Podfoldery** wewnątrz dni też działają: pokazują się jako kafelki nad zdjęciami.

## Gdy coś nie działa

| Komunikat | Co zrobić |
|---|---|
| „Prawie gotowe — uzupełnij plik js/config.js” | Wpisz `clientId` i `rootFolderId` (krok 4). |
| Google: `origin_mismatch` / „redirect_uri_mismatch” | W Client ID dodaj dokładnie `https://TWOJ-LOGIN.github.io` w **Authorized JavaScript origins** (krok 3.6). Zmiana może potrzebować kilku minut. |
| Google: „Dostęp zablokowany: aplikacja nie przeszła weryfikacji” | Tego adresu e-mail nie ma na liście **Test users** (krok 3.4). |
| „Brak dostępu” na stronie | Folder główny nie jest udostępniony temu kontu (krok 5). |
| „Przeglądarka zablokowała okno logowania” | Zezwól na wyskakujące okna dla strony galerii. |

## Pliki

```
index.html          strona (CSP, czcionki, start aplikacji)
css/style.css       wygląd
js/config.js        ← jedyny plik, który musisz edytować
js/app.js           start, adresy (#/f/…), logowanie, wylogowanie
js/auth.js          logowanie Google (Google Identity Services)
js/drive.js         zapytania do Google Drive API
js/data.js          foldery, sortowanie, pilnowanie granic galerii
js/dates.js         rozpoznawanie dat w nazwach folderów
js/images.js        miniatury, pamięć podręczna
js/folder-view.js   kafelki i strona folderu
js/grid.js          siatka zdjęć
js/lightbox.js      podgląd pełnoekranowy
js/pages.js         ekrany logowania, błędów, brak dostępu
```
