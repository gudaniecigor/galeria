// Rozpoznawanie dat w nazwach folderów, np. „2024-07-15”, „15.07.2024”, „15 lipca 2024 Wakacje”, „2024-07”.

const MONTHS = [
  ['stycznia', 'styczen', 'sty'],
  ['lutego', 'luty', 'lut'],
  ['marca', 'marzec', 'mar'],
  ['kwietnia', 'kwiecien', 'kwi'],
  ['maja', 'maj'],
  ['czerwca', 'czerwiec', 'cze'],
  ['lipca', 'lipiec', 'lip'],
  ['sierpnia', 'sierpien', 'sie'],
  ['wrzesnia', 'wrzesien', 'wrz'],
  ['pazdziernika', 'pazdziernik', 'paz'],
  ['listopada', 'listopad', 'lis'],
  ['grudnia', 'grudzien', 'gru'],
];
const MONTH_WORD = `(${MONTHS.flat().join('|')})\\b\\.?`;
const monthIndex = (word) => MONTHS.findIndex((forms) => forms.includes(word)) + 1;

// Grupa 1 to zawsze cały dopasowany fragment z datą.
const PATTERNS = [
  { re: /(?:^|\D)((\d{4})[-._/ ](\d{1,2})[-._/ ](\d{1,2}))(?!\d)/, ymd: (m) => [m[2], m[3], m[4]] },
  { re: /(?:^|\D)((\d{1,2})[-._/ ](\d{1,2})[-._/ ](\d{4}))(?!\d)/, ymd: (m) => [m[4], m[3], m[2]] },
  { re: /(?:^|\D)((\d{4})(\d{2})(\d{2}))(?!\d)/, ymd: (m) => [m[2], m[3], m[4]] },
  { re: new RegExp(`(?:^|\\D)((\\d{1,2})\\.?\\s+${MONTH_WORD}\\s*(\\d{4}))(?!\\d)`), ymd: (m) => [m[4], monthIndex(m[3]), m[2]] },
  { re: /(?:^|\D)((\d{4})[-._/ ](\d{1,2}))(?!\d)/, ymd: (m) => [m[2], m[3]] },
  { re: new RegExp(`(?:^|[^a-z])(${MONTH_WORD}\\s*(\\d{4}))(?!\\d)`), ymd: (m) => [m[3], monthIndex(m[2])] },
  { re: /(?:^|\D)(((?:19|20)\d{2}))(?!\d)/, ymd: (m) => [m[2]] },
];

const PRECISION = ['year', 'month', 'day'];
const TRIM = /^[\s\-_.,·|–—()[\]]+|[\s\-_.,·|–—()[\]]+$/g;

function parse(name) {
  const original = name.normalize('NFC');
  const plain = original.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();

  for (const { re, ymd } of PATTERNS) {
    const m = plain.match(re);
    if (!m) continue;
    const [y, mo = 1, d = 1] = ymd(m).map(Number);
    const precision = PRECISION[ymd(m).length - 1];
    const date = new Date(y, mo - 1, d);
    const valid = y >= 1900 && y <= 2100 && date.getMonth() === mo - 1 && date.getDate() === d;
    if (!valid) continue;

    const start = m.index + m[0].length - m[1].length;
    const rest = `${original.slice(0, start)} ${original.slice(start + m[1].length)}`.replace(TRIM, '').replace(/\s{2,}/g, ' ');
    return { date, precision, rest };
  }
  return null;
}

const format = (date, options) => new Intl.DateTimeFormat('pl-PL', options).format(date);
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Zwraca opis folderu: tytuł do kafelka, pełną datę do nagłówka, rok do grupowania.
export function describeFolder(name = '') {
  const parsed = parse(name);
  if (!parsed) return { dated: false, short: name, full: name, weekday: null, month: null, note: null, year: null, time: null, precision: null };

  const { date, precision, rest } = parsed;
  const base = { dated: true, date, precision, year: date.getFullYear(), time: date.getTime(), note: rest || null, weekday: null, month: null };

  if (precision === 'day') {
    return {
      ...base,
      short: format(date, { day: 'numeric', month: 'long' }),
      full: format(date, { day: 'numeric', month: 'long', year: 'numeric' }),
      weekday: capitalize(format(date, { weekday: 'long' })),
      month: format(date, { month: 'long' }),
    };
  }
  if (precision === 'month') {
    return {
      ...base,
      short: capitalize(format(date, { month: 'long' })),
      full: capitalize(format(date, { month: 'long', year: 'numeric' })),
      month: format(date, { month: 'long' }),
    };
  }
  return { ...base, short: String(base.year), full: String(base.year) };
}

// Tekst do wyszukiwania bez polskich znaków i wielkich liter: „Łódź” → „lodz”.
export const normalize = (text) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();

// Folder można znaleźć po nazwie, pełnej dacie („15 lipca 2024”), miesiącu („lipiec”) i dniu tygodnia.
export const searchText = (name, info) => normalize([name, info.full, info.month, info.weekday, info.note].filter(Boolean).join(' '));

export function yearsAgoLabel(years) {
  return years === 1 ? 'Rok temu' : `${years} ${plural(years, 'rok', 'lata', 'lat')} temu`;
}

export function formatTaken(file) {
  if (!file.takenExact) return null;
  return format(new Date(file.takenAt), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function plural(n, one, few, many) {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? few : many;
}

export const photosLabel = (n) => `${n} ${plural(n, 'zdjęcie', 'zdjęcia', 'zdjęć')}`;
export const albumsLabel = (n) => `${n} ${plural(n, 'album', 'albumy', 'albumów')}`;
