// Testy całej strony na udawanym Dysku Google, w przeglądarce bez okna.
//   node dev/test.mjs            — wszystkie testy
//   node dev/test.mjs mobile     — tylko pliki z „mobile” w nazwie
//   SHOTS=folder node dev/test.mjs  — dodatkowo zapisuje zrzuty ekranu
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './browser.mjs';
import { startServer } from './serve.mjs';

const DEV = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8124;
const filter = process.argv[2];
const files = fs
  .readdirSync(path.join(DEV, 'tests'))
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && (!filter || f.includes(filter)))
  .sort();

const server = await startServer(PORT);
let passed = 0;
const failures = [];

for (const file of files) {
  const page = await launch({ shots: process.env.SHOTS });
  const t = {
    base: `http://localhost:${PORT}/`,
    ok(condition, message) {
      if (condition) passed++;
      else failures.push(`${file}: ${message}`);
      console.log(`  ${condition ? '✓' : '✗'} ${message}`);
    },
    eq(actual, expected, message) {
      const same = JSON.stringify(actual) === JSON.stringify(expected);
      t.ok(same, same ? message : `${message} (jest ${JSON.stringify(actual)}, oczekiwano ${JSON.stringify(expected)})`);
    },
  };
  console.log(`\n${file}`);
  try {
    const scenario = await import(pathToFileURL(path.join(DEV, 'tests', file)).href);
    await scenario.default(page, t);
  } catch (err) {
    t.ok(false, `przerwany: ${err.message.split('\n')[0]}`);
  }
  t.ok(page.errors.length === 0, `brak błędów JS${page.errors.length ? `: ${page.errors.join(' | ')}` : ''}`);
  await page.close();
}

server.close();
console.log(`\n${passed} OK, ${failures.length} błędów`);
if (failures.length) console.log(failures.map((f) => `  ✗ ${f}`).join('\n'));
process.exit(failures.length ? 1 : 0);
