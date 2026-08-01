import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Three's prebuilt WebGPU export is one module; use its modular source entry so
// Rolldown can preserve one Three instance while splitting renderer subsystems.
const threeWebGPUPath = fileURLToPath(
  new URL('../src/Three.WebGPU.js', import.meta.resolve('three/webgpu'))
);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^three\/webgpu$/, replacement: threeWebGPUPath },
      { find: /^three$/, replacement: threeWebGPUPath }
    ]
  },
  build: {
    rolldownOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        calibration: fileURLToPath(new URL('./calibration.html', import.meta.url))
      },
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              // Renderer-neutral simulation is a stable dependency layer used
              // by the game composition root. Keep it out of the growing
              // browser/application chunk while retaining eager startup.
              name: 'simulation',
              test: /src[\\/]simulation[\\/]/,
              priority: 60
            },
            {
              name: 'three-webgpu-renderer',
              test: /node_modules[\\/]three[\\/]src[\\/](?:renderers[\\/]webgpu|lights[\\/]webgpu)[\\/]/,
              priority: 50
            },
            {
              name: 'three-webgl-fallback',
              test: /node_modules[\\/]three[\\/]src[\\/]renderers[\\/]webgl-fallback[\\/]/,
              priority: 40
            },
            {
              name: 'three-renderer-common',
              test: /node_modules[\\/]three[\\/]src[\\/]renderers[\\/]common[\\/]/,
              priority: 30
            },
            {
              name: 'three-nodes',
              test: /node_modules[\\/]three[\\/]src[\\/](?:nodes|materials[\\/]nodes)[\\/]/,
              priority: 20
            },
            {
              name: 'three-core',
              test: /node_modules[\\/]three[\\/]src[\\/]/,
              priority: 10
            }
          ]
        }
      }
    }
  }
});
