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
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        calibration: fileURLToPath(new URL('./calibration.html', import.meta.url))
      },
      output: {
        manualChunks(id) {
          return id.includes('/node_modules/three/')
            ? 'three-webgpu'
            : undefined;
        }
      }
    }
  }
});
