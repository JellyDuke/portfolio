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
      if (source.startsWith('./vendor/')) {
        return path.join(vendorRoot, source.slice('./vendor/'.length));
      }
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
