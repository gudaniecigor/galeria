// Ustawienia galerii — instrukcja krok po kroku jest w pliku README.md.
// Te wartości nie są tajne: bez zalogowania na konto z dostępem do folderu nikt nic nie zobaczy.
export const CONFIG = {
  // Client ID z Google Cloud (Google Auth Platform → Clients), kończy się na .apps.googleusercontent.com
  clientId: '409020391240-dkmqgb14u62pl85q7v51pa7nh53oqvrr.apps.googleusercontent.com',

  // ID głównego folderu ze zdjęciami — końcówka adresu drive.google.com/drive/folders/<ID>
  rootFolderId: '1OsBFf3uJ0ovwUI8AmbsAO63VWRDf-zN6',

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
