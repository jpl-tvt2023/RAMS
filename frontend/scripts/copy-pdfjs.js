// Copies pdf.js's JavaScript decoders for rare PDF image types (JPEG 2000 and
// JBIG2, common in scanned documents) into public/pdfjs-wasm/, where the PDF
// viewer loads them from (src/utils/pdf.js). The site's security policy allows
// no WebAssembly, so the viewer runs with useWasm: false and only these
// fallbacks are ever fetched. vite.config.js runs it when a dev server or a
// build starts, however it is started; the folder is gitignored.
import {
  cpSync, existsSync, mkdirSync, readdirSync, rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FROM = join(here, '..', 'node_modules', 'pdfjs-dist', 'wasm');
const TO = join(here, '..', 'public', 'pdfjs-wasm');

export function copyPdfjsDecoders({ from = FROM, to = TO } = {}) {
  if (!existsSync(from)) throw new Error(`pdf.js: ${from} is missing -- run npm install in frontend/`);
  const names = readdirSync(from).filter((name) => name.endsWith('_nowasm_fallback.js'));
  if (!names.length) throw new Error(`pdf.js: no *_nowasm_fallback.js in ${from} -- has pdfjs-dist changed its layout?`);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const name of names) cpSync(join(from, name), join(to, name));
  return names;
}
