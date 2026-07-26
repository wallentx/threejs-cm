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
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'three-webgpu': ['three/webgpu']
        }
      }
    }
  }
});
