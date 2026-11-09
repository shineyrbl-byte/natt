// Builds the browser-only demo into dist-pages/ for static hosting
// (GitHub Pages): the normal web app, plus Natt's server logic bundled to run
// inside the page. Run with `npm run build:pages`.
import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}dist-pages`;
const shim = (name) => `${root}browser/shims/${name}.js`;

rmSync(out, { recursive: true, force: true });
cpSync(`${root}public`, out, { recursive: true });
mkdirSync(`${out}/vendor`, { recursive: true });
cpSync(`${root}node_modules/qrcode-generator/dist/qrcode.mjs`, `${out}/vendor/qrcode.mjs`);
cpSync(`${root}node_modules/sql.js/dist/sql-wasm-browser.wasm`, `${out}/sql-wasm.wasm`);

await build({
  entryPoints: [`${root}browser/server.js`],
  outfile: `${out}/natt-local.js`,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  alias: {
    'node:crypto': shim('crypto'),
    'node:sqlite': shim('sqlite'),
    'node:fs': shim('fs'),
    'node:path': shim('path'),
  },
  inject: [shim('buffer-global')],
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NATT_NOSTR_SECRET': 'undefined' },
  logLevel: 'warning',
});

// Load the in-page server before the app, and cache it for offline use.
const html = readFileSync(`${out}/index.html`, 'utf8');
writeFileSync(`${out}/index.html`, html.replace('<script type="module" src="app.js"></script>', '<script src="natt-local.js"></script>\n  <script type="module" src="app.js"></script>'));
const sw = readFileSync(`${out}/sw.js`, 'utf8');
writeFileSync(`${out}/sw.js`, sw.replace("'manifest.webmanifest'];", "'manifest.webmanifest', 'natt-local.js', 'sql-wasm.wasm'];"));
writeFileSync(`${out}/.nojekyll`, '');
console.log('Built dist-pages/');
