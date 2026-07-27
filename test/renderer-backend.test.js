import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('browser build uses Three r185 WebGPURenderer with explicit initialization and fallback diagnostics', async () => {
  const [packageSource, rendererSource, appSource, mainSource, viteSource, markup] = await Promise.all([
    read('../package.json'),
    read('../src/engine/Renderer.js'),
    read('../src/app/GameApp.js'),
    read('../src/main.js'),
    read('../vite.config.js'),
    read('../index.html')
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.equal(packageJson.dependencies.three, '^0.185.0');
  assert.match(rendererSource, /new THREE\.WebGPURenderer\(/);
  assert.doesNotMatch(rendererSource, /new THREE\.WebGLRenderer\(/);
  assert.match(rendererSource, /await this\.graphicsRenderer\.init\(\)/);
  assert.match(rendererSource, /await this\.graphicsRenderer\.compileAsync\(/);
  assert.match(rendererSource, /'webgl2-fallback'/);
  assert.match(rendererSource, /graphicsRenderer\.onDeviceLost = info =>/);
  assert.match(rendererSource, /graphicsRenderer\.shadowMap\.enabled = this\.qualityTier !== 'low'/);
  assert.match(rendererSource, /this\.graphicsRenderer\.backend\?\.isWebGLBackend\) throw err/);
  assert.match(appSource, /await this\.renderer\.initialize\(\)/);
  assert.match(appSource, /dataset\.rendererBackend = this\.renderer\.backendName/);
  assert.match(appSource, /new THREE\.Timer\(\)/);
  assert.doesNotMatch(appSource, /new THREE\.Clock\(\)/);
  assert.match(mainSource, /new GameApp\(gameDefinition\)/);
  assert.match(viteSource, /import\.meta\.resolve\('three\/webgpu'\)/);
  assert.match(viteSource, /find:\s*\/\^three\$\/,\s*replacement:\s*threeWebGPUPath/);
  assert.match(markup, /<title>[^<]+WebGPU PoC<\/title>/);
});
