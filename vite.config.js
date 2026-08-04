import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Three's prebuilt WebGPU export is one module; use its modular source entry so
// Rolldown can preserve one Three instance while splitting renderer subsystems.
const threeWebGPUPath = fileURLToPath(
  new URL('../src/Three.WebGPU.js', import.meta.resolve('three/webgpu'))
);
const ezTreeGeometryPath = fileURLToPath(
  new URL('./node_modules/@dgreenheck/ez-tree/src/lib/tree.js', import.meta.url)
);
const ezTreeTextureStubPath = fileURLToPath(
  new URL(
    './src/content/france1940/render/EzTreeTextureStubs.js',
    import.meta.url
  )
);

export default defineConfig({
  plugins: [{
    name: 'ez-tree-geometry-only',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'virtual:ez-tree-geometry') return ezTreeGeometryPath;
      if (
        (source === './textures' || source === './textures.js')
        && importer?.replaceAll('\\', '/').includes(
          '/@dgreenheck/ez-tree/src/lib/tree.js'
        )
      ) {
        return ezTreeTextureStubPath;
      }
      return null;
    }
  }],
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
              // Game-domain coordinators are shared by the browser composition
              // root but do not need to remain fused into its UI/bootstrap
              // chunk. This keeps ordinary feature growth from recreating the
              // production warning without changing eager execution order.
              name: 'game-systems',
              test: /src[\\/]game[\\/]/,
              priority: 55
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
