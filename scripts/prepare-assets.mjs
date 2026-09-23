import { copyFile, mkdir } from 'node:fs/promises';
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
console.log('Shared vendor assets are ready.');
