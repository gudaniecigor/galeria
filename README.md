# Galeria zdjęć z Dysku Google

Prywatna galeria na GitHub Pages. Po zalogowaniu kontem Google pokazuje foldery z Twojego Dysku jako kafelki (pogrupowane po latach), a po kliknięciu otwiera galerię zdjęć z podglądem na pełnym ekranie.

- logowanie przez Google jednym kliknięciem (strona pamięta konto; hasło i weryfikacja dwuetapowa po stronie Google)
- foldery z datami w nazwie (`2024-07-15`, `15.07.2024`, `15 lipca 2024 Wakacje`, `2024-07`…) są rozpoznawane, sortowane i grupowane po latach
- wyszukiwarka (po dacie, miesiącu, nazwie — także bez polskich znaków), pasek z latami i „Wspomnienia” — te same dni w poprzednich latach
- okładka dnia: wybrane przez Ciebie zdjęcie `okladka.jpg` albo poziome zdjęcie ze środka dnia; rozmyta okładka w tle nagłówka
- siatka zdjęć w stylu Zdjęć Google, podgląd pełnoekranowy z rozmytym tłem i paskiem miniatur
- przesuwanie palcem, przybliżanie dwoma palcami / kółkiem myszy / dwuklikiem, przeciągnięcie w dół = zamknięcie
- pokaz slajdów, pobieranie oryginału, link „Otwórz w Dysku Google”
- instalacja jako aplikacja na komputerze i telefonie
- działa na telefonie i komputerze, bez serwera i bez żadnych kosztów

## Jak to jest zabezpieczone

- **Hasło wpisujesz tylko u Google.** Strona dostaje od Google jedynie krótkotrwały (ok. 1 h) klucz dostępu.
- **Zdjęcia zostają prywatne na Dysku.** Strona pokazuje tylko to, do czego zalogowane konto ma dostęp. Osoba bez dostępu nic nie zobaczy, nawet jeśli przeczyta cały kod strony.
- **Tylko odczyt.** Strona prosi o uprawnienie `drive.readonly`, więc nie może niczego zmienić ani usunąć.
- **W kodzie nie ma sekretów.** Client ID i ID folderu mogą być publiczne. Client ID działa wyłącznie z Twoim adresem `github.io`.
- **Podwójna bramka.** Zalogować się mogą tylko osoby dodane jako testerzy w Google Cloud, a zobaczyć zdjęcia tylko te, którym udostępnisz folder.
- Klucz dostępu jest ważny ok. godziny i zostaje w przeglądarce do tego czasu albo do kliknięcia „Wyloguj”. Miniatury i duże podglądy zostają zapamiętane w przeglądarce, żeby kolejne wizyty były szybkie — usuniesz je, czyszcząc dane strony w ustawieniach przeglądarki. Zalogowanie innym kontem („Zmień konto”, „Zaloguj się innym kontem”) kasuje je automatycznie.
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

- **Sesja trwa ok. godziny.** Potem pojawi się okienko „Sesja wygasła” i wystarczy kliknąć **Kontynuuj**. Zamknięcie karty w tym czasie nie wylogowuje.
- **Pierwsze otwarcie folderu może chwilę potrwać.** Google nie udostępnia gotowych miniatur prywatnych zdjęć innym stronom, więc galeria pobiera zdjęcia i sama robi z nich miniatury i duże podglądy (2048 px) — w tle, bez przycinania strony. Wszystko to zapamiętuje w przeglądarce, więc kolejne wizyty i ponowne otwieranie zdjęć są natychmiastowe. Oryginał w pełnej rozdzielczości pobiera się dopiero przy przybliżaniu albo pobieraniu. Na komórkowym internecie warto pierwszy raz otworzyć galerię na Wi-Fi.
- **Rozmyty podgląd od razu.** Jeśli Twoje pliki JPG mają zapisaną przez aparat miniaturkę, galeria pokazuje ją (rozmytą) po pobraniu tylko 64 KB pliku. Gdy pliki jej nie mają, funkcja sama się wyłącza.
- **Okładka dnia:** wrzuć do folderu dnia kopię wybranego zdjęcia pod nazwą `okladka.jpg` — będzie na kafelku i w nagłówku, a nie pojawi się dodatkowo w siatce zdjęć.
- **Pliki RAW** (np. NEF) leżące obok JPG są pomijane — przeglądarka i tak nie umie ich wyświetlić.
- **Kolejność:** w `js/config.js` ustawisz, czy najnowsze dni mają być na górze (`folderOrder`) i czy zdjęcia mają być sortowane po dacie zrobienia, czy po nazwie (`photoOrder`).
- **Podfoldery** wewnątrz dni też działają: pokazują się jako kafelki nad zdjęciami.
- **Skróty klawiszowe:** `/` — wyszukiwarka, `←` `→` — poprzednie / następne zdjęcie, `+` `-` — przybliżanie, `Esc` — oddal / zamknij.

## Instalacja jako aplikacja

- **Komputer (Chrome, Edge, Brave):** przycisk ze strzałką w górnym pasku galerii albo ikonka instalacji na końcu paska adresu.
- **Android (Chrome):** menu ⋮ → **Zainstaluj aplikację** (albo **Dodaj do ekranu głównego**).
- **iPhone (Safari):** **Udostępnij** → **Do ekranu początkowego**. Gdyby logowanie z ikonki na iPhonie nie chciało działać, otwórz galerię w Safari — tam działa zawsze.

Zainstalowana galeria startuje z pamięci urządzenia. Gdy na GitHubie pojawi się nowa wersja, na dole pokaże się „Jest nowa wersja galerii · **Odśwież**”.

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
index.html            strona (CSP, czcionki, start aplikacji)
manifest.webmanifest  dane do instalacji jako aplikacja
sw.js                 zapamiętanie plików strony w urządzeniu, wykrywanie nowej wersji
css/style.css         wygląd
fonts/                czcionki Fraunces i Inter (licencja OFL)
icons/                ikony aplikacji (generuje je dev/make-icons.mjs)
js/config.js          ← jedyny plik, który musisz edytować
js/app.js             start, adresy (#/f/…), logowanie, wylogowanie, instalacja
js/auth.js            logowanie Google (Google Identity Services)
js/drive.js           zapytania do Google Drive API
js/data.js            foldery, okładki, sortowanie, pilnowanie granic galerii
js/dates.js           rozpoznawanie dat w nazwach folderów, wyszukiwanie
js/images.js          miniatury, duże podglądy, pamięć w przeglądarce
js/resize-worker.js   zmniejszanie zdjęć w osobnym wątku
js/exif.js            miniaturka zapisana przez aparat w pliku JPG
js/folder-view.js     strona folderu: kafelki, wyszukiwarka, wspomnienia
js/grid.js            siatka zdjęć
js/lightbox.js        podgląd pełnoekranowy
js/pages.js           ekrany logowania, błędów, brak dostępu
dev/                  narzędzia testowe (nie są używane przez stronę)
```

## Testy (dla programisty)

Wymagają Node.js 22+ i przeglądarki Chrome, Edge albo Brave. Strona jest testowana na udawanym Dysku Google, bez prawdziwego konta:

```bash
node dev/test.mjs
```

Podgląd strony z udawanym Dyskiem: `node dev/serve.mjs`, a potem http://localhost:8123.
