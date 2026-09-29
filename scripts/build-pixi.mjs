import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('assets/generated', { recursive: true });
await build({
  entryPoints: ['pixi-renderer-entry.js'],
  outfile: 'assets/generated/pixi-renderer.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  sourcemap: false
});
console.log('Built local PixiJS renderer bundle.');
