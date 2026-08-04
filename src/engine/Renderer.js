import * as THREE from 'three';

const RENDER_PROFILES = Object.freeze({
  low: Object.freeze({
    maxPixelRatio: 1,
    shadowMapSize: 0
  }),
  high: Object.freeze({
    maxPixelRatio: 1.5,
    shadowMapSize: 1024
  }),
  ultra: Object.freeze({
    maxPixelRatio: 2,
    shadowMapSize: 2048
  })
});

export function normalizeRenderQualityTier(value) {
  return Object.hasOwn(RENDER_PROFILES, value) ? value : 'high';
}

export function getRenderProfile(qualityTier = 'high') {
  return RENDER_PROFILES[normalizeRenderQualityTier(qualityTier)];
}

function hasBlendedMaterial(object) {
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return materials.some(material =>
    Number.isFinite(material?.opacity) && material.opacity < 1
  );
}

export function resolveMeshShadowPolicy(object, shadowsEnabled = true) {
  if (!object?.isMesh || !shadowsEnabled) {
    return { castShadow: false, receiveShadow: false };
  }
  const band = object.userData?.lodBand;
  if (band === 'ui' || hasBlendedMaterial(object)) {
    return { castShadow: false, receiveShadow: false };
  }
  const authored = object.userData.renderShadowPolicy ?? {
    castShadow: object.castShadow,
    receiveShadow: object.receiveShadow
  };
  if (object.userData.infantryLodTier) return authored;
  if (band === 'high' || band === 'medium') {
    return {
      castShadow: false,
      receiveShadow: authored.receiveShadow
    };
  }
  return authored;
}

export class Renderer {
  constructor(container, options = {}) {
    this.container = container;
    this.qualityTier = normalizeRenderQualityTier(options.qualityTier);
    this.renderProfile = getRenderProfile(this.qualityTier);
    this.debugMode = options.debugMode || 'final';
    this.backendName = 'initializing';
    this.deviceLost = false;
    this.onDeviceLost = options.onDeviceLost ?? null;
    this.shadowStats = { casters: 0, receivers: 0 };

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8bb7c9');
    this.scene.fog = new THREE.FogExp2('#9bbbc2', 0.0022);

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.camera.position.set(0, 50, 120);

    // 3. WebGPU renderer with WebGL 2 fallback capability.
    const hasWebGPU = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
    this.graphicsRenderer = this.createGraphicsRenderer({
      forceWebGL: !hasWebGPU
    });

    // 4. Lighting setup
    this.setupLighting();
    this.setDebugMode(this.debugMode);

    // 5. Resize listener
    window.addEventListener('resize', () => this.onWindowResize());
  }

  createGraphicsRenderer({ forceWebGL }) {
    const graphicsRenderer = new THREE.WebGPURenderer({
      forceWebGL,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    if (this.container && !this.container.contains(graphicsRenderer.domElement)) {
      this.container.appendChild(graphicsRenderer.domElement);
    }
    graphicsRenderer.setSize(window.innerWidth, window.innerHeight);
    graphicsRenderer.setPixelRatio(Math.min(
      window.devicePixelRatio,
      this.renderProfile.maxPixelRatio
    ));
    graphicsRenderer.outputColorSpace = THREE.SRGBColorSpace;
    graphicsRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    graphicsRenderer.toneMappingExposure = 0.84;
    graphicsRenderer.shadowMap.enabled = this.renderProfile.shadowMapSize > 0;
    graphicsRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const reportDeviceLost = graphicsRenderer.onDeviceLost.bind(graphicsRenderer);
    graphicsRenderer.onDeviceLost = info => {
      reportDeviceLost(info);
      this.deviceLost = true;
      this.onDeviceLost?.(info);
    };
    return graphicsRenderer;
  }

  get domElement() {
    return this.graphicsRenderer.domElement;
  }

  async initialize() {
    try {
      await this.graphicsRenderer.init();
    } catch (err) {
      if (this.graphicsRenderer.backend?.isWebGLBackend) throw err;
      console.warn('[WARN] WebGPU initialization failed, switching to WebGL2 backend:', err);
      this.graphicsRenderer.dispose();
      this.graphicsRenderer = this.createGraphicsRenderer({ forceWebGL: true });
      this.container.replaceChildren(this.graphicsRenderer.domElement);
      await this.graphicsRenderer.init();
    }
    // The game owns its animation loop. Preserve the completed frame's metrics
    // until the next game render instead of letting the renderer's internal
    // animation helper clear them between diagnostics samples.
    this.graphicsRenderer.info.autoReset = false;
    const backend = this.graphicsRenderer.backend;
    this.backendName = backend?.isWebGPUBackend
      ? 'webgpu'
      : backend?.isWebGLBackend
        ? 'webgl2-fallback'
        : 'unknown';
    return this.backendName;
  }

  async prepareScene() {
    await this.graphicsRenderer.compileAsync(this.scene, this.camera);
  }

  setupLighting() {
    // Soft fill preserves readable silhouettes without flattening the scene.
    const ambient = new THREE.AmbientLight('#e7f0fb', 0.68);
    ambient.name = 'BattlefieldAmbientFill';
    this.scene.add(ambient);

    // Brighter sky/ground fill keeps dark painted armor readable while
    // preserving directional sunlight and contact shadows.
    const hemiLight = new THREE.HemisphereLight('#d8edf4', '#667052', 1.28);
    hemiLight.name = 'BattlefieldHemisphereFill';
    hemiLight.position.set(0, 60, 0);
    this.scene.add(hemiLight);

    // One bounded directional shadow covers the 240 m scenario map.
    this.sunLight = new THREE.DirectionalLight('#fff1d6', 2.55);
    this.sunLight.name = 'BattlefieldSun';
    this.sunLight.position.set(85, 140, 60);
    this.sunLight.castShadow = this.renderProfile.shadowMapSize > 0;
    const shadowSize = Math.max(1, this.renderProfile.shadowMapSize);
    this.sunLight.shadow.mapSize.set(shadowSize, shadowSize);
    this.sunLight.shadow.camera.left = -145;
    this.sunLight.shadow.camera.right = 145;
    this.sunLight.shadow.camera.top = 145;
    this.sunLight.shadow.camera.bottom = -145;
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 340;
    this.sunLight.shadow.bias = -0.00025;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  configureSceneShadows() {
    const shadowsEnabled = this.graphicsRenderer.shadowMap.enabled && this.debugMode !== 'no-shadows';
    let casters = 0;
    let receivers = 0;
    this.scene.traverse((object) => {
      if (!object.isMesh) return;
      if (!object.userData.renderShadowPolicy) {
        object.userData.renderShadowPolicy = {
          castShadow: object.castShadow,
          receiveShadow: object.receiveShadow
        };
      }
      const policy = resolveMeshShadowPolicy(object, shadowsEnabled);
      object.castShadow = policy.castShadow;
      object.receiveShadow = policy.receiveShadow;
      if (object.castShadow) casters++;
      if (object.receiveShadow) receivers++;
    });
    this.shadowStats = { casters, receivers };
  }

  setDebugMode(mode = 'final') {
    this.debugMode = ['final', 'no-shadows', 'no-fog', 'agents'].includes(mode) ? mode : 'final';
    if (this.sunLight) {
      this.sunLight.castShadow = this.graphicsRenderer.shadowMap.enabled && this.debugMode !== 'no-shadows';
    }
    this.scene.fog = this.debugMode === 'no-fog'
      ? null
      : new THREE.FogExp2('#9bbbc2', 0.0022);
    this.configureSceneShadows();
  }

  getDiagnostics() {
    const info = this.graphicsRenderer.info;
    return {
      requestedBackend: 'webgpu',
      backend: this.backendName,
      deviceLost: this.deviceLost,
      qualityTier: this.qualityTier,
      debugMode: this.debugMode,
      pixelRatio: this.graphicsRenderer.getPixelRatio(),
      drawCalls: info.render.drawCalls ?? info.render.calls ?? 0,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      toneMapping: 'ACESFilmic',
      exposure: this.graphicsRenderer.toneMappingExposure,
      shadows: this.sunLight.castShadow,
      shadowMapSize: this.renderProfile.shadowMapSize,
      shadowCasters: this.shadowStats.casters,
      shadowReceivers: this.shadowStats.receivers
    };
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.graphicsRenderer.setSize(window.innerWidth, window.innerHeight);
    this.graphicsRenderer.setPixelRatio(Math.min(
      window.devicePixelRatio,
      this.renderProfile.maxPixelRatio
    ));
  }

  render() {
    this.graphicsRenderer.info.reset();
    this.graphicsRenderer.render(this.scene, this.camera);
  }
}
