import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const vendorRoot = path.join(projectRoot, 'assets', 'vendor');

export default defineConfig({
  root: 'frontend',
  publicDir: '../assets',
  plugins: [{
    name: 'shared-vendor-assets',
    enforce: 'pre',
    resolveId(source) {
      // 루트 덱과 하위 작업 폴더 페이지가 같은 패키지 라이브러리를 사용한다.
      const vendorPrefix = ['./vendor/', '../vendor/'].find(prefix => source.startsWith(prefix));
      if (vendorPrefix) return path.join(vendorRoot, source.slice(vendorPrefix.length));
      return null;
    },
  }],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local'],
    fs: {
      allow: [projectRoot],
    },
  },
});
