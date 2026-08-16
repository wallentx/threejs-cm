import * as THREE from 'three';
import { pass, uniform } from 'three/tsl';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';

const RENDER_PROFILES = Object.freeze({
  low: Object.freeze({
    maxPixelRatio: 1,
    shadowMapSize: 0,
    shadowHalfExtent: 0
  }),
  high: Object.freeze({
    maxPixelRatio: 1.5,
    shadowMapSize: 1024,
    shadowHalfExtent: 48
  }),
  ultra: Object.freeze({
    maxPixelRatio: 2,
    shadowMapSize: 2048,
    shadowHalfExtent: 78
  })
});

const SCENE_FOG_COLOR = '#586e50';
const SCENE_FOG_DENSITY = 0.0015;

export function normalizeRenderQualityTier(value) {
  return Object.hasOwn(RENDER_PROFILES, value) ? value : 'high';
}

export function getRenderProfile(qualityTier = 'high') {
  return RENDER_PROFILES[normalizeRenderQualityTier(qualityTier)];
}

export function resolveDepthOfFieldEnabled({
  qualityTier = 'high',
  requested = false
} = {}) {
  return requested === true && normalizeRenderQualityTier(qualityTier) !== 'low';
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
    this.shadowsEnabled = options.shadowsEnabled === true
      && this.renderProfile.shadowMapSize > 0;
    this.enableDepthOfField = options.enableDepthOfField ?? false;
    this.renderPipeline = null;
    this.dofNode = null;
    this.focusDistanceUniform = null;
    this.focalLengthUniform = null;
    this.bokehScaleUniform = null;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8bb7c9');
    this.scene.fog = new THREE.FogExp2(SCENE_FOG_COLOR, SCENE_FOG_DENSITY);
    // The scene root never moves. Updating its identity transform every frame
    // marks the whole hierarchy dirty and forces every descendant world matrix
    // to be multiplied again. Dynamic children still update from their own
    // transform state.
    this.scene.updateMatrix();
    this.scene.updateMatrixWorld(true);
    this.scene.matrixAutoUpdate = false;
    this.scene.matrixWorldNeedsUpdate = false;

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
    graphicsRenderer.shadowMap.enabled = this.shadowsEnabled;
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
    if (this.enableDepthOfField && typeof document !== 'undefined') {
      this.setupPostProcessing({ focusDistance: 70, focalLength: 50, bokehScale: 3.0 });
    }
    return this.backendName;
  }

  async prepareScene() {
    await this.graphicsRenderer.compileAsync(this.scene, this.camera);
  }

  setupLighting() {
    // Soft fill preserves readable silhouettes without flattening the scene.
    const ambient = new THREE.AmbientLight('#e7f0fb', 0.45);
    ambient.name = 'BattlefieldAmbientFill';
    this.scene.add(ambient);

    // Balanced sky/ground fill keeps dark armor readable and prevents overexposed ground.
    const hemiLight = new THREE.HemisphereLight('#d8edf4', '#556045', 0.95);
    hemiLight.name = 'BattlefieldHemisphereFill';
    hemiLight.position.set(0, 60, 0);
    this.scene.add(hemiLight);

    // Dynamic shadows are opt-in through the debug panel. The configured map
    // size remains a quality capability rather than a default frame cost.
    this.sunLight = new THREE.DirectionalLight('#fff3df', 2.0);
    this.sunLight.name = 'BattlefieldSun';
    this.sunLight.position.set(85, 140, 60);
    this.sunLight.castShadow = this.shadowsEnabled;
    const shadowSize = Math.max(1, this.renderProfile.shadowMapSize);
    const shadowHalfExtent = Math.max(1, this.renderProfile.shadowHalfExtent);
    this.sunLight.shadow.mapSize.set(shadowSize, shadowSize);
    this.sunLight.shadow.camera.left = -shadowHalfExtent;
    this.sunLight.shadow.camera.right = shadowHalfExtent;
    this.sunLight.shadow.camera.top = shadowHalfExtent;
    this.sunLight.shadow.camera.bottom = -shadowHalfExtent;
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 340;
    this.sunLight.shadow.bias = -0.0001;
    this.sunLight.shadow.normalBias = 0.075;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  updateShadowFocus(target) {
    if (!this.sunLight?.castShadow || !target) return false;
    const focusX = Number(target.x);
    const focusZ = Number(target.z);
    if (!Number.isFinite(focusX) || !Number.isFinite(focusZ)) return false;
    const offsetX = 85;
    const offsetY = 140;
    const offsetZ = 60;
    this.sunLight.target.position.set(focusX, 0, focusZ);
    this.sunLight.position.set(
      focusX + offsetX,
      offsetY,
      focusZ + offsetZ
    );
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.updateMatrixWorld();
    return true;
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

  setShadowsEnabled(enabled) {
    this.shadowsEnabled = Boolean(enabled)
      && this.renderProfile.shadowMapSize > 0;
    this.graphicsRenderer.shadowMap.enabled = this.shadowsEnabled;
    if (this.sunLight) {
      this.sunLight.castShadow = this.shadowsEnabled
        && this.debugMode !== 'no-shadows';
    }
    this.configureSceneShadows();
    return Boolean(this.sunLight?.castShadow);
  }

  setDebugMode(mode = 'final') {
    this.debugMode = ['final', 'no-shadows', 'no-fog', 'agents'].includes(mode) ? mode : 'final';
    if (this.sunLight) {
      this.sunLight.castShadow = this.shadowsEnabled && this.debugMode !== 'no-shadows';
    }
    this.scene.fog = this.debugMode === 'no-fog'
      ? null
      : new THREE.FogExp2(SCENE_FOG_COLOR, SCENE_FOG_DENSITY);
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
      shadowMapSize: this.sunLight.castShadow
        ? this.renderProfile.shadowMapSize
        : 0,
      shadowMapCapability: this.renderProfile.shadowMapSize,
      shadowCasters: this.shadowStats.casters,
      shadowReceivers: this.shadowStats.receivers,
      staticTransforms: this.scene.userData.staticTransformStats ?? null,
      depthOfField: Boolean(this.renderPipeline)
    };
  }

  setupPostProcessing({ focusDistance = 60, focalLength = 35, bokehScale = 4.5 } = {}) {
    try {
      const scenePass = pass(this.scene, this.camera);
      const colorNode = scenePass.getTextureNode('output');
      const viewZNode = scenePass.getViewZNode();

      this.focusDistanceUniform = uniform(focusDistance);
      this.focalLengthUniform = uniform(focalLength);
      this.bokehScaleUniform = uniform(bokehScale);

      this.dofNode = dof(
        colorNode,
        viewZNode,
        this.focusDistanceUniform,
        this.focalLengthUniform,
        this.bokehScaleUniform
      );

      const PipelineClass = THREE.RenderPipeline ?? THREE.PostProcessing;
      if (PipelineClass) {
        this.renderPipeline = new PipelineClass(this.graphicsRenderer);
        this.renderPipeline.outputNode = this.dofNode;
      }
      return this.renderPipeline;
    } catch (err) {
      console.warn('[WARN] Post-processing DoF initialization skipped:', err);
      this.renderPipeline = null;
      return null;
    }
  }

  setFocusDistance(distance) {
    if (this.focusDistanceUniform && Number.isFinite(distance)) {
      this.focusDistanceUniform.value = distance;
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.graphicsRenderer.setSize(window.innerWidth, window.innerHeight);
    this.graphicsRenderer.setPixelRatio(Math.min(
      window.devicePixelRatio,
      this.renderProfile.maxPixelRatio
    ));
    if (this.renderPipeline?.setSize) {
      this.renderPipeline.setSize(window.innerWidth, window.innerHeight);
    }
  }

  render() {
    this.graphicsRenderer.info.reset();
    if (this.renderPipeline) {
      this.renderPipeline.render();
    } else {
      this.graphicsRenderer.render(this.scene, this.camera);
    }
  }
}
