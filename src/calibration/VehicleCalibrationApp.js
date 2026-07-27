import * as THREE from 'three';
import { UnitFactory } from '../world/UnitFactory.js';
import {
  BLUEPRINT_CALIBRATION_RECORDS,
  getBlueprintCalibrationRecord
} from './BlueprintCalibrationRecords.js';
import {
  CALIBRATION_VIEWS,
  canvasToSourceNormalized,
  createImageTransform,
  createOrthographicFrame,
  fitImageTransformToLandmarks,
  landmarkErrorMeters,
  sourceNormalizedToCanvas,
  viewMetersToCanvas,
  worldToViewMeters
} from './CalibrationMath.js';
import {
  detachNestedProxyMeshes,
  setCalibrationLodVisibility
} from './CalibrationModel.js';
import { normalizeImportedCalibration } from './CalibrationRecordIO.js';
import { renderVehicleSilhouetteSvg } from './SoftwareSilhouette.js';
import { createVehicleOwnedRegistrations } from './VehicleOwnedRegistration.js';

const MODES = Object.freeze(['overlay', 'difference', 'silhouette', 'wireframe', 'shaded']);
const LOD_TIERS = Object.freeze(['high', 'medium', 'core', 'proxy']);

const cloneRegistration = registration => ({
  imageUrl: registration.imageUrl,
  crop: { ...registration.crop },
  scale: registration.scale,
  offsetX: registration.offsetX,
  offsetY: registration.offsetY,
  rotationDegrees: registration.rotationDegrees ?? 0,
  mirrorX: registration.mirrorX,
  autoFit: Boolean(registration.autoFit),
  landmarks: structuredClone(registration.landmarks)
});

function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} element not found`);
  return element;
}

function countModelGeometry(root) {
  let triangles = 0;
  let meshes = 0;
  root.traverse(object => {
    if (!object.isMesh || !object.visible || !object.geometry) return;
    meshes += 1;
    const geometry = object.geometry;
    triangles += geometry.index
      ? geometry.index.count / 3
      : (geometry.attributes.position?.count ?? 0) / 3;
  });
  return { meshes, triangles: Math.round(triangles) };
}

export class VehicleCalibrationApp {
  constructor({ vehicleMeshFactories, calibrationReferences } = {}) {
    if (!vehicleMeshFactories || typeof vehicleMeshFactories !== 'object') {
      throw new Error('VehicleCalibrationApp requires vehicleMeshFactories');
    }
    if (!calibrationReferences || typeof calibrationReferences.get !== 'function') {
      throw new Error('VehicleCalibrationApp requires calibrationReferences');
    }
    this.vehicleMeshFactories = vehicleMeshFactories;
    this.calibrationReferences = calibrationReferences;
    this.viewport = requiredElement('calibration-viewport');
    this.rendererHost = requiredElement('calibration-renderer');
    this.blueprintCanvas = requiredElement('blueprint-canvas');
    this.annotationCanvas = requiredElement('annotation-canvas');
    this.vehicleSelect = requiredElement('vehicle-select');
    this.viewSelect = requiredElement('view-select');
    this.lodSelect = requiredElement('lod-select');
    this.modeSelect = requiredElement('render-mode-select');
    this.opacityInput = requiredElement('blueprint-opacity');
    this.fileInput = requiredElement('blueprint-file');
    this.urlInput = requiredElement('blueprint-url');
    this.loadUrlButton = requiredElement('load-blueprint-url');
    this.sourceLink = requiredElement('blueprint-source');
    this.mirrorInput = requiredElement('blueprint-mirror');
    this.scaleInput = requiredElement('blueprint-scale');
    this.offsetXInput = requiredElement('blueprint-offset-x');
    this.offsetYInput = requiredElement('blueprint-offset-y');
    this.rotationInput = requiredElement('blueprint-rotation');
    this.cropInputs = {
      left: requiredElement('crop-left'),
      top: requiredElement('crop-top'),
      right: requiredElement('crop-right'),
      bottom: requiredElement('crop-bottom')
    };
    this.landmarkSelect = requiredElement('landmark-select');
    this.placeLandmarkButton = requiredElement('place-landmark');
    this.clearLandmarkButton = requiredElement('clear-landmark');
    this.fitLandmarksButton = requiredElement('fit-landmarks');
    this.resetButton = requiredElement('reset-registration');
    this.importInput = requiredElement('import-registration');
    this.exportButton = requiredElement('export-registration');
    this.statusElement = requiredElement('calibration-status');
    this.metricsElement = requiredElement('calibration-metrics');
    this.landmarkReport = requiredElement('landmark-report');

    const params = new URLSearchParams(window.location.search);
    this.modelId = BLUEPRINT_CALIBRATION_RECORDS[params.get('vehicle')]
      ? params.get('vehicle')
      : 'fr_somua';
    this.view = CALIBRATION_VIEWS[params.get('view')] ? params.get('view') : 'side';
    this.lodTier = LOD_TIERS.includes(params.get('lod')) ? params.get('lod') : 'high';
    this.mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'overlay';
    this.modelCache = new Map();
    this.registrationDefaults = new Map();
    this.registrationState = new Map();
    this.imageCache = new Map();
    this.currentModel = null;
    this.currentImage = null;
    this.blueprintTransform = null;
    this.frame = null;
    this.placeLandmark = false;
    this.renderQueued = false;
    this.objectUrls = new Set();
    this.queryBlueprint = params.get('blueprint');
  }

  async initialize() {
    document.body.dataset.calibrationStatus = 'loading';
    this.populateControls();
    this.bindControls();
    await this.initializeRenderer();
    this.createScene();
    this.applyRenderMode();
    this.selectModel(this.modelId);
    this.syncRegistrationControls();

    if (this.queryBlueprint) {
      const registration = this.getRegistration();
      registration.imageUrl = this.queryBlueprint;
      this.urlInput.value = this.queryBlueprint;
      await this.loadImage(this.queryBlueprint);
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
    this.resize();
    this.requestRender();
    window.__VEHICLE_CALIBRATION__ = this;
    document.body.dataset.calibrationStatus = 'ready';
    document.body.dataset.rendererBackend = this.backendName;
    this.setStatus('Ready. Load a side, front, or top reference and register its datums.');
  }

  populateControls() {
    for (const [modelId, record] of Object.entries(BLUEPRINT_CALIBRATION_RECORDS)) {
      const option = document.createElement('option');
      option.value = modelId;
      option.textContent = `${record.designation} (${modelId})`;
      this.vehicleSelect.append(option);
    }
    for (const view of Object.values(CALIBRATION_VIEWS)) {
      const option = document.createElement('option');
      option.value = view.id;
      option.textContent = view.label;
      this.viewSelect.append(option);
    }
    this.vehicleSelect.value = this.modelId;
    this.viewSelect.value = this.view;
    this.lodSelect.value = this.lodTier;
    this.modeSelect.value = this.mode;
    this.populateLandmarks();
  }

  populateLandmarks() {
    this.landmarkSelect.replaceChildren();
    const record = getBlueprintCalibrationRecord(this.modelId);
    for (const landmark of record.landmarks) {
      if (!landmark.views.includes(this.view)) continue;
      const option = document.createElement('option');
      option.value = landmark.id;
      option.textContent = landmark.label;
      this.landmarkSelect.append(option);
    }
  }

  bindControls() {
    this.vehicleSelect.addEventListener('change', () => {
      this.modelId = this.vehicleSelect.value;
      this.populateLandmarks();
      this.selectModel(this.modelId);
      this.syncRegistrationControls();
      this.updateUrl();
    });
    this.viewSelect.addEventListener('change', () => {
      this.view = this.viewSelect.value;
      this.populateLandmarks();
      this.syncRegistrationControls();
      this.updateCamera();
      this.updateUrl();
    });
    this.lodSelect.addEventListener('change', () => {
      this.lodTier = this.lodSelect.value;
      this.applyLodTier();
      this.updateUrl();
    });
    this.modeSelect.addEventListener('change', () => {
      this.mode = this.modeSelect.value;
      this.applyRenderMode();
      this.updateUrl();
    });
    this.opacityInput.addEventListener('input', () => this.requestRender());
    this.fileInput.addEventListener('change', async () => {
      const file = this.fileInput.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      this.objectUrls.add(url);
      const registration = this.getRegistration();
      registration.imageUrl = url;
      this.urlInput.value = file.name;
      await this.loadImage(url);
    });
    this.loadUrlButton.addEventListener('click', async () => {
      const url = this.urlInput.value.trim();
      if (!url) return;
      this.getRegistration().imageUrl = url;
      await this.loadImage(url);
    });
    this.mirrorInput.addEventListener('change', () => this.updateRegistrationFromControls());
    for (const input of [
      this.scaleInput,
      this.offsetXInput,
      this.offsetYInput,
      this.rotationInput,
      ...Object.values(this.cropInputs)
    ]) {
      input.addEventListener('input', () => this.updateRegistrationFromControls());
    }
    this.placeLandmarkButton.addEventListener('click', () => {
      this.placeLandmark = !this.placeLandmark;
      this.annotationCanvas.classList.toggle('placing', this.placeLandmark);
      this.placeLandmarkButton.classList.toggle('active', this.placeLandmark);
      this.setStatus(this.placeLandmark
        ? `Click matching blueprint point for ${this.landmarkSelect.selectedOptions[0]?.textContent}.`
        : 'Landmark placement cancelled.');
    });
    this.clearLandmarkButton.addEventListener('click', () => {
      delete this.getRegistration().landmarks[this.landmarkSelect.value];
      this.requestRender();
    });
    this.fitLandmarksButton.addEventListener('click', () => this.fitRegistrationFromLandmarks());
    this.annotationCanvas.addEventListener('click', event => this.handleLandmarkClick(event));
    this.resetButton.addEventListener('click', () => this.resetRegistration());
    this.importInput.addEventListener('change', () => this.importRegistration());
    this.exportButton.addEventListener('click', () => this.exportRegistration());
  }

  async initializeRenderer() {
    const create = forceWebGL => {
      const renderer = new THREE.WebGPURenderer({
        forceWebGL,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      return renderer;
    };

    const initializeGpuRenderer = async forceWebGL => {
      this.renderer = create(forceWebGL);
      this.rendererHost.replaceChildren(this.renderer.domElement);
      await this.renderer.init();
    };
    const hasWebGPU = Boolean(navigator.gpu);
    try {
      await initializeGpuRenderer(!hasWebGPU);
    } catch (initialError) {
      this.renderer?.dispose();
      this.renderer = null;
      if (hasWebGPU) {
        try {
          await initializeGpuRenderer(true);
        } catch (fallbackError) {
          this.renderer?.dispose();
          this.renderer = null;
          this.initializeSoftwareRenderer(fallbackError);
        }
      } else {
        this.initializeSoftwareRenderer(initialError);
      }
    }
    if (!this.renderer) return;
    this.backendName = this.renderer.backend?.isWebGPUBackend
      ? 'webgpu'
      : 'webgl2-fallback';
    this.renderer.info.autoReset = false;
  }

  initializeSoftwareRenderer(error) {
    this.softwareImage = new Image();
    this.softwareImage.alt = 'CPU-rendered vehicle calibration silhouette';
    this.softwareImage.className = 'software-calibration-render';
    this.rendererHost.replaceChildren(this.softwareImage);
    this.backendName = 'cpu-svg-fallback';
    this.rendererInitializationError = error instanceof Error ? error.message : String(error);
  }

  drawSoftwareModel(width, height) {
    const record = getBlueprintCalibrationRecord(this.modelId);
    const silhouette = this.mode === 'difference'
      ? '#ffffff'
      : this.mode === 'shaded'
        ? '#475569'
        : this.mode === 'wireframe'
          ? '#0891b2'
          : '#111827';
    const { svg } = renderVehicleSilhouetteSvg(
      this.currentModel,
      record.dimensionsMeters,
      this.view,
      {
        width,
        height,
        background: 'transparent',
        silhouette,
        showEnvelope: false,
        wireframe: this.mode === 'wireframe'
      }
    );
    this.softwareImage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  rendererReady() {
    return Boolean(this.renderer || this.softwareImage);
  }

  resetRendererInfo() {
    if (this.renderer) {
      this.renderer.info.reset();
    }
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.OrthographicCamera(-4, 4, 3, -1, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4b5563, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(5, 8, 6);
    this.scene.add(key);
    this.silhouetteMaterial = new THREE.MeshBasicMaterial({
      color: 0x111827,
      side: THREE.DoubleSide
    });
    this.differenceMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    this.wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      wireframe: true
    });
  }

  getRegistrationKey(modelId = this.modelId, view = this.view) {
    return `${modelId}:${view}`;
  }

  getRegistration(modelId = this.modelId, view = this.view) {
    const key = this.getRegistrationKey(modelId, view);
    if (!this.registrationState.has(key)) {
      const source = this.registrationDefaults.get(modelId)?.[view]
        ?? getBlueprintCalibrationRecord(modelId).views[view];
      this.registrationState.set(key, cloneRegistration(source));
    }
    return this.registrationState.get(key);
  }

  selectModel(modelId) {
    if (this.currentModel) this.scene.remove(this.currentModel);
    if (!this.modelCache.has(modelId)) {
      const model = UnitFactory.createTankMesh(modelId, this.vehicleMeshFactories);
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      model.updateMatrixWorld(true);
      // Some articulated far barrels inherit recoil by living below a detailed
      // barrel mesh. Detach those proxy meshes for this static inspection scene
      // so hiding detailed geometry cannot hide the proxy with its carrier.
      detachNestedProxyMeshes(model);
      this.modelCache.set(modelId, model);
    }
    this.currentModel = this.modelCache.get(modelId);
    if (!this.registrationDefaults.has(modelId)) {
      this.registrationDefaults.set(
        modelId,
        createVehicleOwnedRegistrations(
          this.currentModel,
          getBlueprintCalibrationRecord(modelId),
          { referenceRegistry: this.calibrationReferences }
        )
      );
    }
    this.scene.add(this.currentModel);
    this.applyLodTier();
    this.updateCamera();
    this.updateSourceLink();
    this.requestRender();
  }

  applyLodTier() {
    if (!this.currentModel) return;
    setCalibrationLodVisibility(this.currentModel, this.lodTier);
    this.requestRender();
  }

  applyRenderMode() {
    this.scene.overrideMaterial = this.mode === 'wireframe'
      ? this.wireframeMaterial
      : this.mode === 'shaded'
        ? null
        : this.mode === 'difference'
          ? this.differenceMaterial
          : this.silhouetteMaterial;
    this.rendererHost.style.opacity = this.mode === 'overlay'
      ? '0.72'
      : this.mode === 'shaded'
        ? '1'
        : '0.94';
    this.rendererHost.style.mixBlendMode = this.mode === 'difference' ? 'difference' : 'normal';
    this.blueprintCanvas.style.filter = this.mode === 'difference'
      ? 'grayscale(1) contrast(1.8)'
      : 'none';
    this.requestRender();
  }

  updateCamera() {
    if (!this.camera || !this.viewport) return;
    const record = getBlueprintCalibrationRecord(this.modelId);
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    this.frame = createOrthographicFrame(record.dimensionsMeters, this.view, width / height);
    this.camera.left = this.frame.left;
    this.camera.right = this.frame.right;
    this.camera.top = this.frame.top - this.frame.centerV;
    this.camera.bottom = this.frame.bottom - this.frame.centerV;
    const distance = 20;
    const centerY = record.dimensionsMeters.height * 0.5;
    if (this.view === 'side') {
      this.camera.position.set(distance, centerY, 0);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, centerY, 0);
    } else if (this.view === 'front') {
      this.camera.position.set(0, centerY, distance);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, centerY, 0);
    } else {
      this.camera.position.set(0, distance, 0);
      this.camera.up.set(0, 0, 1);
      this.camera.lookAt(0, 0, 0);
    }
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  resize() {
    const width = Math.max(1, Math.round(this.viewport.clientWidth));
    const height = Math.max(1, Math.round(this.viewport.clientHeight));
    const dpr = Math.min(window.devicePixelRatio, 2);
    if (this.renderer) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
    }
    for (const canvas of [this.blueprintCanvas, this.annotationCanvas]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    this.updateCamera();
  }

  syncRegistrationControls() {
    const registration = this.getRegistration();
    this.scaleInput.value = String(registration.scale);
    this.offsetXInput.value = String(registration.offsetX);
    this.offsetYInput.value = String(registration.offsetY);
    this.rotationInput.value = String(registration.rotationDegrees ?? 0);
    this.mirrorInput.checked = registration.mirrorX;
    for (const edge of Object.keys(this.cropInputs)) {
      this.cropInputs[edge].value = String(Math.round(registration.crop[edge] * 100));
    }
    this.urlInput.value = registration.imageUrl?.startsWith('blob:') ? '' : (registration.imageUrl ?? '');
    const cached = this.imageCache.get(this.getRegistrationKey());
    this.currentImage = cached ?? null;
    if (!cached && registration.imageUrl) this.loadImage(registration.imageUrl);
    this.updateSourceLink();
    this.requestRender();
  }

  updateRegistrationFromControls() {
    const registration = this.getRegistration();
    registration.scale = Number(this.scaleInput.value);
    registration.offsetX = Number(this.offsetXInput.value);
    registration.offsetY = Number(this.offsetYInput.value);
    registration.rotationDegrees = Number(this.rotationInput.value);
    registration.mirrorX = this.mirrorInput.checked;
    for (const edge of Object.keys(this.cropInputs)) {
      registration.crop[edge] = Number(this.cropInputs[edge].value) / 100;
    }
    this.requestRender();
  }

  async loadImage(url) {
    this.setStatus('Loading blueprint image...');
    const image = new Image();
    // The jig only draws source pixels; it never reads or exports the canvas.
    // Avoid anonymous CORS mode because many archival image hosts omit ACAO
    // headers even though browsers may still display their rasters normally.
    try {
      await new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', reject, { once: true });
        image.src = url;
      });
    } catch {
      this.setStatus('Image load failed. Download remote blueprint, then use local file upload.', true);
      return;
    }
    this.currentImage = image;
    this.imageCache.set(this.getRegistrationKey(), image);
    this.setStatus(`Loaded ${image.naturalWidth} x ${image.naturalHeight} reference.`);
    if (this.getRegistration().autoFit) this.fitRegistrationFromLandmarks();
    else this.requestRender();
  }

  updateSourceLink() {
    const source = getBlueprintCalibrationRecord(this.modelId).sourceUrls[0];
    this.sourceLink.href = source;
    this.sourceLink.textContent = source;
  }

  resetRegistration() {
    const source = this.registrationDefaults.get(this.modelId)?.[this.view]
      ?? getBlueprintCalibrationRecord(this.modelId).views[this.view];
    this.registrationState.set(this.getRegistrationKey(), cloneRegistration(source));
    this.imageCache.delete(this.getRegistrationKey());
    this.currentImage = null;
    this.syncRegistrationControls();
    this.setStatus('Registration reset.');
  }

  handleLandmarkClick(event) {
    if (!this.placeLandmark || !this.currentImage || !this.blueprintTransform) return;
    const bounds = this.annotationCanvas.getBoundingClientRect();
    const point = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    };
    const sourcePoint = canvasToSourceNormalized(
      point,
      this.blueprintTransform,
      this.currentImage.naturalWidth,
      this.currentImage.naturalHeight
    );
    this.getRegistration().landmarks[this.landmarkSelect.value] = sourcePoint;
    this.placeLandmark = false;
    this.annotationCanvas.classList.remove('placing');
    this.placeLandmarkButton.classList.remove('active');
    this.setStatus(`Placed ${this.landmarkSelect.selectedOptions[0]?.textContent}.`);
    this.requestRender();
  }

  fitRegistrationFromLandmarks() {
    if (!this.currentImage || !this.frame) {
      this.setStatus('Load a blueprint before fitting landmarks.', true);
      return;
    }
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    const record = getBlueprintCalibrationRecord(this.modelId);
    const registration = this.getRegistration();
    const baseline = createImageTransform({
      imageWidth: this.currentImage.naturalWidth,
      imageHeight: this.currentImage.naturalHeight,
      canvasWidth: width,
      canvasHeight: height,
      crop: registration.crop,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotationDegrees: registration.rotationDegrees ?? 0,
      mirrorX: registration.mirrorX
    });
    const matching = record.landmarks.filter(landmark => (
      landmark.views.includes(this.view) && registration.landmarks[landmark.id]
    ));
    if (matching.length < 2) {
      this.setStatus('Place at least two landmarks in this view before fitting.', true);
      return;
    }
    try {
      const fit = fitImageTransformToLandmarks(
        matching.map(landmark => sourceNormalizedToCanvas(
          registration.landmarks[landmark.id],
          baseline,
          this.currentImage.naturalWidth,
          this.currentImage.naturalHeight
        )),
        matching.map(landmark => viewMetersToCanvas(
          worldToViewMeters(landmark.world, this.view),
          this.frame,
          width,
          height
        )),
        { x: width * 0.5, y: height * 0.5 }
      );
      registration.scale = fit.scale;
      registration.offsetX = fit.offsetX;
      registration.offsetY = fit.offsetY;
      registration.autoFit = false;
      this.syncRegistrationControls();
      this.setStatus(
        `Fitted ${matching.length} landmarks; residual ${(fit.rmsPixels).toFixed(1)} px.`
      );
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Landmark fit failed.', true);
    }
  }

  requestRender() {
    if (!this.rendererReady() || this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  render() {
    if (!this.rendererReady() || !this.currentModel || !this.frame) return;
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    this.drawBlueprint();
    this.drawAnnotations();
    this.resetRendererInfo();
    if (this.renderer) this.renderer.render(this.scene, this.camera);
    else this.drawSoftwareModel(width, height);
    const geometry = countModelGeometry(this.currentModel);
    const dimensions = getBlueprintCalibrationRecord(this.modelId).dimensionsMeters;
    this.metricsElement.textContent = [
      `${dimensions.length.toFixed(2)} x ${dimensions.width.toFixed(2)} x ${dimensions.height.toFixed(2)} m`,
      `${this.backendName}`,
      `${geometry.meshes} visible meshes`,
      `${geometry.triangles.toLocaleString()} tris`,
      `${CALIBRATION_VIEWS[this.view].screenAxes}`
    ].join(' | ');
  }

  drawBlueprint() {
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const context = this.blueprintCanvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    this.blueprintTransform = null;
    if (!this.currentImage) return;

    const registration = this.getRegistration();
    const transform = createImageTransform({
      imageWidth: this.currentImage.naturalWidth,
      imageHeight: this.currentImage.naturalHeight,
      canvasWidth: width,
      canvasHeight: height,
      crop: registration.crop,
      scale: registration.scale,
      offsetX: registration.offsetX,
      offsetY: registration.offsetY,
      rotationDegrees: registration.rotationDegrees ?? 0,
      mirrorX: registration.mirrorX
    });
    this.blueprintTransform = transform;
    context.save();
    context.globalAlpha = Number(this.opacityInput.value);
    context.translate(transform.centerX, transform.centerY);
    context.rotate(transform.rotation);
    context.scale(transform.mirrorX ? -1 : 1, 1);
    context.drawImage(
      this.currentImage,
      transform.sourceX,
      transform.sourceY,
      transform.sourceWidth,
      transform.sourceHeight,
      -transform.drawWidth * 0.5,
      -transform.drawHeight * 0.5,
      transform.drawWidth,
      transform.drawHeight
    );
    context.restore();
  }

  drawAnnotations() {
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const context = this.annotationCanvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    this.drawGrid(context, width, height);
    this.drawRigidEnvelope(context, width, height);
    this.drawLandmarks(context, width, height);
  }

  drawGrid(context, width, height) {
    const step = 0.25;
    const startU = Math.ceil(this.frame.left / step) * step;
    const startV = Math.ceil(this.frame.bottom / step) * step;
    context.lineWidth = 1;
    for (let u = startU; u <= this.frame.right + 1e-6; u += step) {
      const x = viewMetersToCanvas({ u, v: 0 }, this.frame, width, height).x;
      const major = Math.abs(u - Math.round(u)) < 1e-5;
      context.strokeStyle = major ? 'rgba(20,35,50,.24)' : 'rgba(20,35,50,.09)';
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let v = startV; v <= this.frame.top + 1e-6; v += step) {
      const y = viewMetersToCanvas({ u: 0, v }, this.frame, width, height).y;
      const major = Math.abs(v - Math.round(v)) < 1e-5;
      context.strokeStyle = major ? 'rgba(20,35,50,.24)' : 'rgba(20,35,50,.09)';
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  }

  drawRigidEnvelope(context, width, height) {
    const dimensions = getBlueprintCalibrationRecord(this.modelId).dimensionsMeters;
    const horizontal = this.view === 'side' ? dimensions.length : dimensions.width;
    const minV = this.view === 'top' ? -dimensions.length * 0.5 : 0;
    const maxV = this.view === 'top' ? dimensions.length * 0.5 : dimensions.height;
    const first = viewMetersToCanvas(
      { u: -horizontal * 0.5, v: maxV },
      this.frame,
      width,
      height
    );
    const second = viewMetersToCanvas(
      { u: horizontal * 0.5, v: minV },
      this.frame,
      width,
      height
    );
    context.strokeStyle = 'rgba(220,38,38,.85)';
    context.lineWidth = 1.5;
    context.setLineDash([8, 5]);
    context.strokeRect(first.x, first.y, second.x - first.x, second.y - first.y);
    context.setLineDash([]);
    context.fillStyle = 'rgba(127,29,29,.95)';
    context.font = '12px ui-monospace, monospace';
    context.fillText('rigid envelope', first.x + 6, first.y + 16);
  }

  drawLandmarks(context, width, height) {
    const record = getBlueprintCalibrationRecord(this.modelId);
    const registration = this.getRegistration();
    const errors = [];
    for (const landmark of record.landmarks) {
      if (!landmark.views.includes(this.view)) continue;
      const modelPoint = viewMetersToCanvas(
        worldToViewMeters(landmark.world, this.view),
        this.frame,
        width,
        height
      );
      context.fillStyle = '#f97316';
      context.beginPath();
      context.arc(modelPoint.x, modelPoint.y, 4, 0, Math.PI * 2);
      context.fill();

      const sourcePoint = registration.landmarks[landmark.id];
      if (!sourcePoint || !this.currentImage || !this.blueprintTransform) continue;
      const referencePoint = sourceNormalizedToCanvas(
        sourcePoint,
        this.blueprintTransform,
        this.currentImage.naturalWidth,
        this.currentImage.naturalHeight
      );
      const error = landmarkErrorMeters(modelPoint, referencePoint, this.frame, width, height);
      errors.push({ landmark, error });
      context.strokeStyle = '#22c55e';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(referencePoint.x - 5, referencePoint.y);
      context.lineTo(referencePoint.x + 5, referencePoint.y);
      context.moveTo(referencePoint.x, referencePoint.y - 5);
      context.lineTo(referencePoint.x, referencePoint.y + 5);
      context.stroke();
      context.strokeStyle = 'rgba(234,88,12,.75)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(modelPoint.x, modelPoint.y);
      context.lineTo(referencePoint.x, referencePoint.y);
      context.stroke();
      context.fillStyle = '#7c2d12';
      context.font = '11px ui-monospace, monospace';
      context.fillText(`${(error * 100).toFixed(1)} cm`, referencePoint.x + 7, referencePoint.y - 7);
    }
    this.updateLandmarkReport(errors);
  }

  updateLandmarkReport(errors) {
    if (!errors.length) {
      this.landmarkReport.textContent = 'No registered landmarks for this view.';
      return;
    }
    const rms = Math.sqrt(
      errors.reduce((sum, entry) => sum + entry.error ** 2, 0) / errors.length
    );
    this.landmarkReport.textContent = [
      ...errors.map(entry => `${entry.landmark.label}: ${(entry.error * 100).toFixed(1)} cm`),
      `RMS: ${(rms * 100).toFixed(1)} cm`
    ].join('\n');
  }

  exportRegistration() {
    const views = {};
    for (const view of Object.keys(CALIBRATION_VIEWS)) {
      const registration = this.getRegistration(this.modelId, view);
      views[view] = {
        imageUrl: registration.imageUrl?.startsWith('blob:') ? null : registration.imageUrl,
        crop: registration.crop,
        scale: registration.scale,
        offsetX: registration.offsetX,
        offsetY: registration.offsetY,
        rotationDegrees: registration.rotationDegrees ?? 0,
        mirrorX: registration.mirrorX,
        landmarks: registration.landmarks
      };
    }
    const record = getBlueprintCalibrationRecord(this.modelId);
    const payload = {
      modelId: this.modelId,
      designation: record.designation,
      dimensionsMeters: record.dimensionsMeters,
      dimensionPolicy: record.dimensionPolicy,
      sourceUrls: record.sourceUrls,
      views
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.modelId}-blueprint-calibration.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.setStatus('Calibration JSON exported.');
  }

  async importRegistration() {
    const file = this.importInput.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const record = getBlueprintCalibrationRecord(this.modelId);
      const views = normalizeImportedCalibration(payload, record);
      for (const [viewName, registration] of Object.entries(views)) {
        const key = this.getRegistrationKey(this.modelId, viewName);
        this.registrationState.set(key, registration);
        this.imageCache.delete(key);
      }
      this.currentImage = null;
      this.syncRegistrationControls();
      this.setStatus(`Imported ${file.name}.`);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Calibration import failed.', true);
    } finally {
      this.importInput.value = '';
    }
  }

  updateUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('vehicle', this.modelId);
    url.searchParams.set('view', this.view);
    url.searchParams.set('lod', this.lodTier);
    url.searchParams.set('mode', this.mode);
    window.history.replaceState(null, '', url);
  }

  setStatus(message, error = false) {
    this.statusElement.textContent = message;
    this.statusElement.classList.toggle('error', error);
  }
}
