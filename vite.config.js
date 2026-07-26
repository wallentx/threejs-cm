import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const threeWebGPUPath = fileURLToPath(import.meta.resolve('three/webgpu'));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^three$/, replacement: threeWebGPUPath }
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three-webgpu': ['three/webgpu']
        }
      }
    }
  }
});
