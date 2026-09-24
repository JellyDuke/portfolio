// 프론트·공유 자산을 배포 폴더에 복사하고 내용 기반 캐시 키를 생성한다.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

// 개발 중에는 기본 재검증을 쓰고 배포 결과에서만 실제 파일 내용에 맞는 캐시 키를 만든다.
// 고정 버전 문자열을 재사용해 새 목록에 이전 대형 종이 CSS가 섞이는 문제를 막는다.
const portfolioHtmlPath = path.join(dist, 'portfolio', 'index.html');
let portfolioHtml = await readFile(portfolioHtmlPath, 'utf8');
for (const filename of ['portfolio.css', 'portfolio.js']) {
  const contents = await readFile(path.join(dist, 'portfolio', filename));
  const revision = createHash('sha256').update(contents).digest('hex').slice(0, 12);
  portfolioHtml = portfolioHtml.replace(`"./${filename}"`, `"./${filename}?v=${revision}"`);
}
await writeFile(portfolioHtmlPath, portfolioHtml);

console.log('Frontend and shared assets were built into dist.');
