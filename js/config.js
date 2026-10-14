// Ustawienia galerii — instrukcja krok po kroku jest w pliku README.md.
// Te wartości nie są tajne: bez zalogowania na konto z dostępem do folderu nikt nic nie zobaczy.
export const CONFIG = {
  // Client ID z Google Cloud (Google Auth Platform → Clients), kończy się na .apps.googleusercontent.com
  clientId: 'WKLEJ_TUTAJ_CLIENT_ID.apps.googleusercontent.com',

  // ID głównego folderu ze zdjęciami — końcówka adresu drive.google.com/drive/folders/<ID>
  rootFolderId: 'WKLEJ_TUTAJ_ID_FOLDERU',

  // Tytuł i podtytuł strony
  title: 'Nasze zdjęcia',
  subtitle: 'Prywatna galeria',

  // Kolejność folderów z datami: 'newest' (najnowsze na górze) albo 'oldest'
  folderOrder: 'newest',

  // Kolejność zdjęć w folderze: 'taken' (wg daty zrobienia zdjęcia) albo 'name' (wg nazwy pliku)
  photoOrder: 'taken',

  // Zapamiętuj miniatury w przeglądarce, żeby kolejne wizyty były szybsze.
  // Są usuwane po kliknięciu „Wyloguj”.
  cacheThumbnails: true,
};
