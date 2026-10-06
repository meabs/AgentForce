// Post-process dist-demo/ for static hosting (GitHub Pages):
//  - drop cursor-live.json (live bridge data never ships in the replay-only build)
//  - 404.html = index.html so any unknown path under the subpath still boots the replay
//  - .nojekyll so Pages serves files as-is (no Jekyll processing)
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-demo';
if (!existsSync(join(out, 'index.html'))) {
  console.error(`[postbuild-demo] ${out}/index.html missing; did the build run?`);
  process.exit(1);
}
rmSync(join(out, 'cursor-live.json'), { force: true });
copyFileSync(join(out, 'index.html'), join(out, '404.html'));
writeFileSync(join(out, '.nojekyll'), '');
console.log(`[postbuild-demo] ${out}: removed cursor-live.json, wrote 404.html and .nojekyll`);
