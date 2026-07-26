import * as THREE from 'three';

export class Renderer {
  constructor(container, options = {}) {
    this.container = container;
    this.qualityTier = options.qualityTier === 'low' ? 'low' : 'high';
    this.debugMode = options.debugMode || 'final';
    
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

    // 3. WebGL Renderer
    this.webglRenderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    const maxPixelRatio = this.qualityTier === 'low' ? 1.25 : 2;
    this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.webglRenderer.toneMappingExposure = 0.72;
    this.webglRenderer.shadowMap.enabled = this.qualityTier !== 'low';
    this.webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.webglRenderer.domElement);

    // 4. Lighting setup
    this.setupLighting();
    this.setDebugMode(this.debugMode);

    // 5. Resize listener
    window.addEventListener('resize', () => this.onWindowResize());
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
    const shadowsEnabled = this.webglRenderer.shadowMap.enabled && this.debugMode !== 'no-shadows';
    this.scene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = shadowsEnabled;
      object.receiveShadow = shadowsEnabled;
    });
  }

  setDebugMode(mode = 'final') {
    this.debugMode = ['final', 'no-shadows', 'no-fog', 'agents'].includes(mode) ? mode : 'final';
    if (this.sunLight) {
      this.sunLight.castShadow = this.webglRenderer.shadowMap.enabled && this.debugMode !== 'no-shadows';
    }
    this.scene.fog = this.debugMode === 'no-fog'
      ? null
      : new THREE.FogExp2('#9bbbc2', 0.0022);
  }

  getDiagnostics() {
    const info = this.webglRenderer.info;
    return {
      qualityTier: this.qualityTier,
      debugMode: this.debugMode,
      pixelRatio: this.webglRenderer.getPixelRatio(),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      toneMapping: 'ACESFilmic',
      exposure: this.webglRenderer.toneMappingExposure,
      shadows: this.sunLight.castShadow
    };
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    const maxPixelRatio = this.qualityTier === 'low' ? 1.25 : 2;
    this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  }

  render() {
    this.webglRenderer.render(this.scene, this.camera);
  }
}
