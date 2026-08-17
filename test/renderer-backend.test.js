import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import {
  Renderer,
  getRenderProfile,
  normalizeRenderQualityTier,
  resolveDepthOfFieldEnabled,
  resolveMeshShadowPolicy
} from '../src/engine/Renderer.js';
import { installWebGpuGlobalCompat } from '../src/engine/WebGpuGlobalCompat.js';

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
  assert.match(rendererSource, /graphicsRenderer\.shadowMap\.enabled = this\.shadowsEnabled/);
  assert.match(rendererSource, /this\.graphicsRenderer\.backend\?\.isWebGLBackend\) throw err/);
  assert.match(appSource, /await this\.renderer\.initialize\(\)/);
  assert.match(appSource, /dataset\.rendererBackend = this\.renderer\.backendName/);
  assert.match(appSource, /new THREE\.Timer\(\)/);
  assert.doesNotMatch(appSource, /new THREE\.Clock\(\)/);
  assert.match(mainSource, /new GameApp\(createGameDefinition\(selection\)\)/);
  assert.match(viteSource, /import\.meta\.resolve\('three\/webgpu'\)/);
  assert.match(viteSource, /find:\s*\/\^three\$\/,\s*replacement:\s*threeWebGPUPath/);
  assert.match(markup, /<title>[^<]+WebGPU PoC<\/title>/);
  assert.match(markup, /src="\.\/src\/bootstrap\.js"/);
});

test('browser bootstrap supplies only the missing WebGPU shader-stage constants', () => {
  const missingWebGpuGlobal = {};
  const fallback = installWebGpuGlobalCompat(missingWebGpuGlobal);
  assert.deepEqual(fallback, { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 });
  assert.equal(Object.isFrozen(fallback), true);

  const nativeStages = { VERTEX: 11, FRAGMENT: 22, COMPUTE: 44 };
  const nativeWebGpuGlobal = { GPUShaderStage: nativeStages };
  assert.equal(installWebGpuGlobalCompat(nativeWebGpuGlobal), nativeStages);
  assert.equal(nativeWebGpuGlobal.GPUShaderStage, nativeStages);
});

test('render profiles bound pixel and shadow cost with explicit ultra opt-in', () => {
  assert.equal(normalizeRenderQualityTier('missing'), 'high');
  assert.deepEqual(getRenderProfile('low'), {
    maxPixelRatio: 1,
    shadowMapSize: 0,
    shadowHalfExtent: 0
  });
  assert.deepEqual(getRenderProfile('high'), {
    maxPixelRatio: 1.5,
    shadowMapSize: 1024,
    shadowHalfExtent: 48
  });
  assert.deepEqual(getRenderProfile('ultra'), {
    maxPixelRatio: 2,
    shadowMapSize: 2048,
    shadowHalfExtent: 78
  });
});

test('depth of field is explicit and unavailable on the low render tier', () => {
  assert.equal(resolveDepthOfFieldEnabled(), false);
  assert.equal(resolveDepthOfFieldEnabled({ qualityTier: 'high', requested: true }), true);
  assert.equal(resolveDepthOfFieldEnabled({ qualityTier: 'ultra', requested: true }), true);
  assert.equal(resolveDepthOfFieldEnabled({ qualityTier: 'low', requested: true }), false);
});

test('shadow policy keeps core silhouettes and rejects detail, UI, and blended casters', () => {
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.lodBand = 'core';
  assert.deepEqual(resolveMeshShadowPolicy(mesh, true), {
    castShadow: true,
    receiveShadow: true
  });

  mesh.userData.lodBand = 'medium';
  assert.deepEqual(resolveMeshShadowPolicy(mesh, true), {
    castShadow: false,
    receiveShadow: true
  });

  mesh.userData.infantryLodTier = 'medium';
  assert.deepEqual(resolveMeshShadowPolicy(mesh, true), {
    castShadow: true,
    receiveShadow: true
  });
  delete mesh.userData.infantryLodTier;

  mesh.userData.lodBand = 'ui';
  assert.deepEqual(resolveMeshShadowPolicy(mesh, true), {
    castShadow: false,
    receiveShadow: false
  });

  mesh.userData.lodBand = 'core';
  material.transparent = true;
  material.opacity = 0.5;
  assert.deepEqual(resolveMeshShadowPolicy(mesh, true), {
    castShadow: false,
    receiveShadow: false
  });
  assert.deepEqual(resolveMeshShadowPolicy(mesh, false), {
    castShadow: false,
    receiveShadow: false
  });
});

test('scene shadow configuration restores authored policy after no-shadows mode', () => {
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial()
  );
  core.userData.lodBand = 'core';
  core.castShadow = true;
  core.receiveShadow = true;
  const detail = core.clone();
  detail.userData = { lodBand: 'high' };
  const scene = new THREE.Scene();
  scene.add(core, detail);
  const renderer = Object.create(Renderer.prototype);
  renderer.scene = scene;
  renderer.graphicsRenderer = { shadowMap: { enabled: true } };
  renderer.debugMode = 'final';

  renderer.configureSceneShadows();
  assert.equal(core.castShadow, true);
  assert.equal(detail.castShadow, false);
  assert.deepEqual(renderer.shadowStats, { casters: 1, receivers: 2 });

  renderer.debugMode = 'no-shadows';
  renderer.configureSceneShadows();
  assert.equal(core.castShadow, false);
  assert.equal(core.receiveShadow, false);

  renderer.debugMode = 'final';
  renderer.configureSceneShadows();
  assert.equal(core.castShadow, true);
  assert.equal(core.receiveShadow, true);
});

test('SHADOWS control rejects low tier and diagnostics separate active state from capability', () => {
  const makeHarness = qualityTier => {
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial()
    );
    core.userData.lodBand = 'core';
    core.castShadow = true;
    core.receiveShadow = true;
    const renderer = Object.create(Renderer.prototype);
    renderer.qualityTier = qualityTier;
    renderer.renderProfile = getRenderProfile(qualityTier);
    renderer.scene = new THREE.Scene();
    renderer.scene.add(core);
    renderer.graphicsRenderer = {
      shadowMap: { enabled: false },
      getPixelRatio: () => renderer.renderProfile.maxPixelRatio,
      info: {
        render: { calls: 0, triangles: 0 },
        memory: { geometries: 1, textures: 0 }
      },
      toneMappingExposure: 1
    };
    renderer.sunLight = { castShadow: false };
    renderer.backendName = 'webgl2';
    renderer.deviceLost = false;
    renderer.debugMode = 'final';
    renderer.shadowStats = { casters: 0, receivers: 0 };
    renderer.renderPipeline = null;
    return { renderer, core };
  };

  const low = makeHarness('low');
  assert.equal(low.renderer.setShadowsEnabled(true), false);
  assert.equal(low.renderer.graphicsRenderer.shadowMap.enabled, false);
  assert.equal(low.core.castShadow, false);
  assert.deepEqual(
    [low.renderer.getDiagnostics().shadows,
      low.renderer.getDiagnostics().shadowMapSize,
      low.renderer.getDiagnostics().shadowMapCapability],
    [false, 0, 0]
  );

  for (const [tier, capability] of [['high', 1024], ['ultra', 2048]]) {
    const harness = makeHarness(tier);
    assert.equal(harness.renderer.setShadowsEnabled(true), true);
    assert.equal(harness.renderer.graphicsRenderer.shadowMap.enabled, true);
    assert.equal(harness.core.castShadow, true);
    const active = harness.renderer.getDiagnostics();
    assert.equal(active.shadows, true);
    assert.equal(active.shadowMapSize, capability);
    assert.equal(active.shadowMapCapability, capability);
    assert.equal(harness.renderer.setShadowsEnabled(false), false);
    const disabled = harness.renderer.getDiagnostics();
    assert.equal(disabled.shadows, false);
    assert.equal(disabled.shadowMapSize, 0);
    assert.equal(disabled.shadowMapCapability, capability);
  }
});

test('directional shadows use facade-safe depth bias', () => {
  const renderer = Object.create(Renderer.prototype);
  renderer.scene = new THREE.Scene();
  renderer.renderProfile = getRenderProfile('high');
  renderer.graphicsRenderer = { shadowMap: { enabled: true } };

  renderer.setupLighting();

  assert.equal(renderer.sunLight.shadow.bias, -0.0001);
  assert.equal(renderer.sunLight.shadow.normalBias, 0.075);
});

test('Renderer.initialize falls back to WebGL2 when WebGPU init throws getCanvasTarget or null error', async () => {
  const container = {
    appendChild: () => {},
    replaceChildren: () => {}
  };
  const renderer = Object.create(Renderer.prototype);
  renderer.container = container;
  renderer.renderProfile = { maxPixelRatio: 1, shadowMapSize: 1024 };

  let webglCreated = false;
  renderer.createGraphicsRenderer = ({ forceWebGL }) => {
    if (forceWebGL) webglCreated = true;
    return {
      domElement: {},
      backend: forceWebGL ? { isWebGLBackend: true } : { isWebGPUBackend: true },
      init: async () => {
        if (!forceWebGL) {
          throw new TypeError("Cannot read properties of null (reading 'getCanvasTarget')");
        }
      },
      dispose: () => {},
      info: { autoReset: false }
    };
  };
  renderer.graphicsRenderer = renderer.createGraphicsRenderer({ forceWebGL: false });

  const backendName = await renderer.initialize();
  assert.equal(webglCreated, true);
  assert.equal(backendName, 'webgl2-fallback');
});
