import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './prepare-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');
const assets = path.join(root, 'assets');
const dist = path.join(root, 'dist');

if (path.dirname(dist) !== root || path.basename(dist) !== 'dist') {
  throw new Error(`Refusing to clean unexpected output directory: ${dist}`);
}

// 배포용 정적 파일만 복사하고 시안·원본 이미지 보관함은 결과물에서 제외한다.
async function copyContents(source, destination, excludedNames = []) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (excludedNames.includes(entry.name)) continue;
    await cp(path.join(source, entry.name), path.join(destination, entry.name), { recursive: true });
  }
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyContents(frontend, dist);
await copyContents(assets, dist, ['source']);

console.log('Frontend and shared assets were built into dist.');
