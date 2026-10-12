// Builds the two JavaScript bundles that need node_modules:
//   src/3d/scenes.js     -> site/assets/js/3d/scenes.js   (three.js scenes, tree-shaken)
//   src/vendor/qrcode.js -> site/assets/js/vendor/qrcode.js
// Everything else in site/ is hand-written and needs no build.
// Run:  npm install && npm run build
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const common = {
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2020', 'safari15'],
  legalComments: 'none',
  logLevel: 'warning',
};

const jobs = [
  {
    entryPoints: ['src/3d/scenes.js'],
    outfile: 'site/assets/js/3d/scenes.js',
    banner: { js: '/*! Dragon Forge Digital 3D scenes — built from src/3d with esbuild. Includes three.js (MIT, (c) 2010-2026 three.js authors). */' },
  },
  {
    entryPoints: ['src/vendor/qrcode.js'],
    outfile: 'site/assets/js/vendor/qrcode.js',
    banner: { js: '/*! QR Code Generator for JavaScript (c) 2009 Kazuhiko Arase, MIT license. https://github.com/kazuhikoarase/qrcode-generator */' },
  },
];

for (const job of jobs) {
  await build({ ...common, ...job });
  const buf = readFileSync(job.outfile);
  console.log(`${job.outfile.padEnd(36)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB  (${(gzipSync(buf).length / 1024).toFixed(1)} KB gzipped)`);
}
