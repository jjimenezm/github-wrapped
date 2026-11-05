// Copies the scripts the video composition loads into its vendor/ folder, straight from
// node_modules: GSAP and the browser bundle of @wrapped/art. A render never fetches a script from
// a CDN (one that fails to download only logs a warning, and the video renders without motion).
//   node scripts/vendor-composition.mjs        # from apps/renderer, after building @wrapped/art
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, '..', 'compositions', 'wrap', 'vendor');

const files = {
  'gsap.min.js': 'gsap/dist/gsap.min.js',
  'art.iife.js': '@wrapped/art/build/art.iife.js',
};

mkdirSync(vendor, { recursive: true });
for (const [name, specifier] of Object.entries(files)) {
  let source;
  try {
    source = require.resolve(specifier);
  } catch {
    console.error(`Missing ${specifier}: run pnpm install, then pnpm --filter @wrapped/art build.`);
    process.exit(1);
  }
  copyFileSync(source, join(vendor, name));
}
console.log(`Vendored ${Object.keys(files).join(', ')} into ${vendor}`);
