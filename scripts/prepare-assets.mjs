// 빌드와 개발 서버가 동일한 Three 및 glTF 로더 파일을 공유하도록 자산을 준비한다.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'assets', 'vendor');

await mkdir(vendor, { recursive: true });
for (const name of ['three.module.js', 'three.core.js']) {
  await copyFile(path.join(root, 'node_modules', 'three', 'build', name), path.join(vendor, name));
}
await copyFile(path.join(root, 'node_modules', 'three', 'LICENSE'), path.join(vendor, 'THREE-LICENSE.txt'));
await copyFile(path.join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), path.join(vendor, 'gsap.min.js'));
// 정적 Sites에서도 GLB 로더가 npm 경로 없이 같은 Three 인스턴스를 참조하도록 경로만 바꾼다.
for (const [name, source] of [
  ['GLTFLoader.js', ['loaders', 'GLTFLoader.js']],
  ['BufferGeometryUtils.js', ['utils', 'BufferGeometryUtils.js']],
  ['SkeletonUtils.js', ['utils', 'SkeletonUtils.js']],
]) {
  const sourcePath = path.join(root, 'node_modules', 'three', 'examples', 'jsm', ...source);
  const content = (await readFile(sourcePath, 'utf8'))
    .replaceAll("from 'three'", "from './three.module.js'")
    .replaceAll("from '../utils/BufferGeometryUtils.js'", "from './BufferGeometryUtils.js'")
    .replaceAll("from '../utils/SkeletonUtils.js'", "from './SkeletonUtils.js'");
  await writeFile(path.join(vendor, name), content);
}
console.log('Shared vendor assets are ready.');
