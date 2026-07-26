import * as THREE from 'three';

export class Renderer {
  constructor(container, options = {}) {
    this.container = container;
    this.qualityTier = options.qualityTier === 'low' ? 'low' : 'high';
    this.debugMode = options.debugMode || 'final';
    this.backendName = 'initializing';
    this.deviceLost = false;
    this.onDeviceLost = options.onDeviceLost ?? null;

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

    this.container.appendChild(this.graphicsRenderer.domElement);

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
    graphicsRenderer.setSize(window.innerWidth, window.innerHeight);
    const maxPixelRatio = this.qualityTier === 'low' ? 1.25 : 2;
    graphicsRenderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    graphicsRenderer.outputColorSpace = THREE.SRGBColorSpace;
    graphicsRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    graphicsRenderer.toneMappingExposure = 0.72;
    graphicsRenderer.shadowMap.enabled = this.qualityTier !== 'low';
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
    const ambient = new THREE.AmbientLight('#dbeafe', 0.45);
    this.scene.add(ambient);

    // Hemisphere Light
    const hemiLight = new THREE.HemisphereLight('#cfe8f3', '#47552f', 1.0);
    hemiLight.position.set(0, 60, 0);
    this.scene.add(hemiLight);

    // One bounded directional shadow covers the 240 m scenario map.
    this.sunLight = new THREE.DirectionalLight('#fff1d6', 2.3);
    this.sunLight.position.set(85, 140, 60);
    this.sunLight.castShadow = this.qualityTier !== 'low';
    const shadowSize = this.qualityTier === 'low' ? 1024 : 2048;
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
    this.scene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = shadowsEnabled;
      object.receiveShadow = shadowsEnabled;
    });
  }

  setDebugMode(mode = 'final') {
    this.debugMode = ['final', 'no-shadows', 'no-fog', 'agents'].includes(mode) ? mode : 'final';
    if (this.sunLight) {
      this.sunLight.castShadow = this.graphicsRenderer.shadowMap.enabled && this.debugMode !== 'no-shadows';
    }
    this.scene.fog = this.debugMode === 'no-fog'
      ? null
      : new THREE.FogExp2('#9bbbc2', 0.0022);
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
      shadows: this.sunLight.castShadow
    };
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.graphicsRenderer.setSize(window.innerWidth, window.innerHeight);
    const maxPixelRatio = this.qualityTier === 'low' ? 1.25 : 2;
    this.graphicsRenderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  }

  render() {
    this.graphicsRenderer.info.reset();
    this.graphicsRenderer.render(this.scene, this.camera);
  }
}
