// Assembles the folder to upload to a Hugging Face Space:   node deploy/huggingface/build-space.mjs
// Result: deploy/huggingface/space/  (Dockerfile, README.md, server/{index.js,privacy.html,package*.json})
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const out = path.join(here, 'space');
if (path.basename(out) !== 'space') throw new Error('unexpected output folder');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'server'), { recursive: true });
for (const f of ['Dockerfile', 'README.md']) fs.copyFileSync(path.join(here, f), path.join(out, f));
for (const f of ['index.js', 'privacy.html', 'package.json', 'package-lock.json']) {
  fs.copyFileSync(path.join(root, 'server', f), path.join(out, 'server', f));
}
console.log('Ready:', out);
console.log(fs.readdirSync(out, { recursive: true }).join('\n'));
