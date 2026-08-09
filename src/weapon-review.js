import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFrance1940InfantryWeaponRig } from './content/france1940/render/France1940InfantryWeaponFactory.js';
import { BERTHIER_M1892_M16_VISUAL_DATA } from './content/france1940/render/BerthierM1892M16VisualData.js';
import { MAS36_VISUAL_DATA } from './content/france1940/render/Mas36VisualData.js';
import {
  WEAPON_REVIEW_CAMERA_POSES,
  WEAPON_REVIEW_RENDER_MODES,
  applyWeaponReviewBlueprintTouchGesture,
  createWeaponReviewOrthographicFrame,
  createWeaponReviewPerspectiveFrame,
  createWeaponReviewTextureWindow,
  describeWeaponReviewAxisView,
  normalizeWeaponReviewOverlayState,
  rectToWeaponReviewViewport,
  resolveWeaponReviewBlueprintFileKind,
  resolveWeaponReviewBlueprintPreset,
  resolveWeaponReviewContentViewport,
  resolveWeaponReviewMaximizedView,
  resolveWeaponReviewModelOpacity,
  resolveWeaponReviewPinchGesture,
  resolveWeaponReviewSvgRasterSize,
  resolveWeaponReviewViewportMetrics
} from './debug/WeaponReviewLayout.js';

const MAS36_BLUEPRINT_URL = new URL(
  '../reference/mas36-bp/Fusil modele 1936.svg',
  import.meta.url
).href;
const BERTHIER_M1892_M16_BLUEPRINT_URL = new URL(
  '../reference/berthier_1892_m16.png',
  import.meta.url
).href;

document.body.dataset.gameStatus = 'loading';

const weaponMaterials = {
  metal: new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  boltMetal: new THREE.MeshStandardMaterial({ color: 0x8e9692, roughness: 0.62, metalness: 0.55, side: THREE.DoubleSide })
};
const reviewMaterials = {
  silhouette: new THREE.MeshBasicMaterial({ color: 0x111827, side: THREE.DoubleSide }),
  difference: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  wireframe: new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, wireframe: true })
};
const persistentMaterials = new Set([
  ...Object.values(weaponMaterials),
  ...Object.values(reviewMaterials)
]);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fbed3);
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(-2, 3, 2);
scene.add(dirLight);

const camSide = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
camSide.layers.enable(1);
const camTop = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
camTop.layers.enable(2);
const camFront = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
camFront.layers.enable(3);
const cam3D = new THREE.PerspectiveCamera(45, 1, 0.01, 100);

class WeaponReviewOrbitControls extends OrbitControls {
  constructor(camera, element) {
    super(camera, element);
    this.secondPointerFallback = new THREE.Vector2();
  }

  _getSecondPointerPosition(event) {
    const position = super._getSecondPointerPosition(event);
    if (position) return position;

    // Mobile browsers can cancel one pointer between a captured two-finger
    // sequence and its next move. Hold the prior pinch distance for that event
    // instead of letting OrbitControls dereference the missing pointer.
    const priorDistance = Math.max(1, this._dollyStart.y || 1);
    return this.secondPointerFallback.set(event.pageX + priorDistance, event.pageY);
  }
}

const viewConfigs = [
  { containerId: 'cell-tl', camera: camSide, calibrationView: 'side', cameraDirection: 1, rotate: false },
  { containerId: 'cell-tr', camera: camTop, calibrationView: 'top', cameraDirection: 1, rotate: false },
  { containerId: 'cell-bl', camera: camFront, calibrationView: 'front', cameraDirection: 1, rotate: false },
  { containerId: 'cell-br', camera: cam3D, calibrationView: null, rotate: true }
];

const views = viewConfigs.map((config) => {
  const container = document.getElementById(config.containerId);
  const controls = new WeaponReviewOrbitControls(config.camera, container);
  controls.enableRotate = config.rotate;
  controls.screenSpacePanning = true;
  if (!config.rotate) {
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
  }
  return { ...config, container, controls };
});

const rendererHost = document.getElementById('canvas-container');
const viewGrid = document.getElementById('grid');
const toolbar = document.getElementById('controls');
const safeAreaProbe = document.getElementById('safe-area-probe');
const viewIds = Object.freeze(viewConfigs.map((config) => config.containerId));
const renderModeSelect = document.getElementById('render-mode-select');
const modelOpacityInput = document.getElementById('model-opacity');
const modelOpacityOutput = document.getElementById('model-opacity-output');
const textureLoader = new THREE.TextureLoader();
const localZAxis = new THREE.Vector3(0, 0, 1);
const rotationQuaternion = new THREE.Quaternion();

let renderer = null;
let animationFrame = null;
let currentWeapon = null;
let currentDesignation = null;
let currentBounds = null;
let selectionGeneration = 0;
let maximizedViewId = null;
let viewportLayoutFrame = null;
let viewportSettleTimeouts = [];
let viewportMetrics = null;
let renderMode = WEAPON_REVIEW_RENDER_MODES.includes(renderModeSelect.value)
  ? renderModeSelect.value
  : 'overlay';
let modelOpacity = resolveWeaponReviewModelOpacity(modelOpacityInput.value, renderMode);

const blueprintViews = Object.fromEntries(
  [...document.querySelectorAll('.blueprint-tools')].map((root) => [
    root.dataset.viewKey,
    {
      root,
      label: root.dataset.viewLabel,
      mesh: null,
      imageWidth: 1,
      imageHeight: 1,
      state: normalizeWeaponReviewOverlayState(),
      initialState: normalizeWeaponReviewOverlayState(),
      sourceKind: null,
      touchAdjust: true,
      pointers: new Map(),
      gesture: null,
      view: views.find((view) => view.containerId === root.closest('.view-cell')?.id),
      controls: null
    }
  ])
);

function readViewportMetrics() {
  return resolveWeaponReviewViewportMetrics({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    documentWidth: document.documentElement.clientWidth,
    documentHeight: document.documentElement.clientHeight,
    visualViewport: window.visualViewport
  });
}

function applyViewportLayout() {
  viewportLayoutFrame = null;
  viewportMetrics = readViewportMetrics();
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--review-viewport-left', `${viewportMetrics.offsetLeft}px`);
  rootStyle.setProperty('--review-viewport-top', `${viewportMetrics.offsetTop}px`);
  rootStyle.setProperty('--review-viewport-width', `${viewportMetrics.width}px`);
  rootStyle.setProperty('--review-viewport-height', `${viewportMetrics.height}px`);

  // Reading after the width variables are applied measures the toolbar in its
  // new orientation instead of retaining the previous breakpoint's height.
  const toolbarBottom = toolbar.getBoundingClientRect().bottom;
  const safeAreaBottom = safeAreaProbe.getBoundingClientRect().height;
  const content = resolveWeaponReviewContentViewport(
    viewportMetrics,
    toolbarBottom,
    safeAreaBottom
  );
  rootStyle.setProperty('--review-content-top', `${content.top}px`);
  rootStyle.setProperty('--review-content-height', `${content.height}px`);

  renderer?.setSize(
    Math.max(1, Math.round(viewportMetrics.width)),
    Math.max(1, Math.round(viewportMetrics.height))
  );
  document.body.dataset.viewportWidth = String(Math.round(viewportMetrics.width));
  document.body.dataset.viewportHeight = String(Math.round(viewportMetrics.height));
}

function scheduleViewportLayout(settle = false) {
  if (viewportLayoutFrame === null) {
    viewportLayoutFrame = requestAnimationFrame(applyViewportLayout);
  }
  if (!settle) return;
  for (const timeout of viewportSettleTimeouts) clearTimeout(timeout);
  viewportSettleTimeouts = [120, 360].map((delay) => (
    setTimeout(() => scheduleViewportLayout(false), delay)
  ));
}

function createRenderer(forceWebGL = false) {
  const nextRenderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
  nextRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const size = viewportMetrics ?? readViewportMetrics();
  nextRenderer.setSize(Math.max(1, Math.round(size.width)), Math.max(1, Math.round(size.height)));
  nextRenderer.domElement.style.pointerEvents = 'none';
  rendererHost.replaceChildren(nextRenderer.domElement);
  return nextRenderer;
}

function boundsToRecord(box) {
  return Object.freeze({
    min: Object.freeze(box.min.toArray()),
    max: Object.freeze(box.max.toArray())
  });
}

function disposeObject(root) {
  if (!root) return;
  root.removeFromParent();
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material && !persistentMaterials.has(material)) material.dispose();
    }
  });
}

function getViewAspect(container) {
  const rect = container.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1;
}

function applyOrthographicProjection(view, aspect) {
  const frame = createWeaponReviewOrthographicFrame(currentBounds, view.calibrationView, aspect, {
    cameraDirection: view.cameraDirection
  });
  view.camera.left = -frame.width * 0.5;
  view.camera.right = frame.width * 0.5;
  view.camera.top = frame.height * 0.5;
  view.camera.bottom = -frame.height * 0.5;
  view.camera.updateProjectionMatrix();
  return frame;
}

function applyOrthographicCamera(view, aspect) {
  const frame = applyOrthographicProjection(view, aspect);
  const pose = WEAPON_REVIEW_CAMERA_POSES[view.calibrationView];
  const description = describeWeaponReviewAxisView(view.calibrationView, view.cameraDirection);
  view.camera.up.fromArray(pose.up);
  view.camera.position.fromArray(frame.position);
  view.camera.near = 0.005;
  view.camera.far = Math.max(100, frame.distance * 10);
  view.camera.zoom = 1;
  view.camera.updateProjectionMatrix();
  view.controls.target.fromArray(frame.target);
  view.controls.update();
  view.container.querySelector('.view-label').textContent = description.label;
  view.container.querySelector('.axis-flip-button').textContent = description.flipLabel;
}

function resetCameras() {
  for (const view of views) {
    const aspect = getViewAspect(view.container);
    if (view.calibrationView) {
      applyOrthographicCamera(view, aspect);
    } else {
      const frame = createWeaponReviewPerspectiveFrame(currentBounds, aspect);
      const direction = new THREE.Vector3(1, 0.58, 1.15).normalize();
      view.camera.aspect = aspect;
      view.camera.fov = frame.fovDegrees;
      view.camera.near = frame.near;
      view.camera.far = frame.far;
      view.camera.position.fromArray(frame.target).addScaledVector(direction, frame.distance);
      view.camera.updateProjectionMatrix();
      view.controls.target.fromArray(frame.target);
    }
    if (!view.calibrationView) view.controls.update();
  }
}

function updateMaterialOpacity(material, opacity) {
  material.opacity = opacity;
  material.transparent = opacity < 1;
  material.depthWrite = opacity >= 1;
  material.needsUpdate = true;
}

function applyModelAppearance() {
  modelOpacity = resolveWeaponReviewModelOpacity(String(modelOpacityInput.value), renderMode);
  modelOpacityInput.value = String(modelOpacity);
  modelOpacityOutput.value = modelOpacity.toFixed(2);

  for (const material of persistentMaterials) updateMaterialOpacity(material, modelOpacity);
  if (!currentWeapon) return;

  currentWeapon.traverse((object) => {
    if (!object.isMesh) return;
    const baseMaterial = object.userData.weaponReviewBaseMaterial ?? object.material;
    object.userData.weaponReviewBaseMaterial = baseMaterial;
    if (renderMode === 'shaded') object.material = baseMaterial;
    else if (renderMode === 'wireframe') object.material = reviewMaterials.wireframe;
    else if (renderMode === 'difference') object.material = reviewMaterials.difference;
    else object.material = reviewMaterials.silhouette;
  });
  document.body.dataset.weaponReviewRenderMode = renderMode;
}

function configureBlueprintOrientation(viewKey, mesh) {
  if (viewKey === 'tl') {
    mesh.layers.set(1);
    mesh.rotation.y = Math.PI / 2;
  } else if (viewKey === 'tr') {
    mesh.layers.set(2);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotateZ(Math.PI);
  } else if (viewKey === 'bl') {
    mesh.layers.set(3);
  }
  mesh.userData.reviewBaseQuaternion = mesh.quaternion.clone();
}

function applyBlueprintAppearance(viewKey) {
  const blueprint = blueprintViews[viewKey];
  const mesh = blueprint?.mesh;
  if (!mesh || !currentBounds) return;

  const state = blueprint.state;
  const cameraDirection = blueprint.view?.cameraDirection ?? 1;
  const window = createWeaponReviewTextureWindow(state);
  const texture = mesh.material.map;
  texture.repeat.set(window.repeat[0], window.repeat[1]);
  texture.offset.set(window.offset[0], window.offset[1]);
  texture.updateMatrix();

  const croppedAspect = (
    blueprint.imageWidth * window.visibleWidth
  ) / Math.max(1, blueprint.imageHeight * window.visibleHeight);
  mesh.scale.set(croppedAspect * state.scale, state.scale, 1);
  mesh.material.opacity = state.opacity;
  mesh.material.needsUpdate = true;
  mesh.quaternion.copy(mesh.userData.reviewBaseQuaternion).multiply(
    rotationQuaternion.setFromAxisAngle(
      localZAxis,
      THREE.MathUtils.degToRad(state.rotationDegrees * cameraDirection)
    )
  );

  const center = currentBounds.min.map((minimum, axis) => (
    (minimum + currentBounds.max[axis]) * 0.5
  ));
  if (viewKey === 'tl') {
    mesh.position.set(
      cameraDirection === 1 ? currentBounds.min[0] - 0.02 : currentBounds.max[0] + 0.02,
      center[1] + state.offsetY,
      center[2] - state.offsetX * cameraDirection
    );
  } else if (viewKey === 'tr') {
    mesh.position.set(
      center[0] - state.offsetX * cameraDirection,
      cameraDirection === 1 ? currentBounds.min[1] - 0.02 : currentBounds.max[1] + 0.02,
      center[2] + state.offsetY
    );
  } else if (viewKey === 'bl') {
    mesh.position.set(
      center[0] + state.offsetX * cameraDirection,
      center[1] + state.offsetY,
      cameraDirection === 1 ? currentBounds.min[2] - 0.02 : currentBounds.max[2] + 0.02
    );
  }
}

function loadWeapon(designation) {
  disposeObject(currentWeapon);

  const heldRig = createFrance1940InfantryWeaponRig(designation, weaponMaterials);
  const weaponModel = heldRig.userData.weaponModel;
  if (!weaponModel) throw new Error(`Weapon review model is unavailable for ${designation}`);
  heldRig.remove(weaponModel);
  weaponModel.position.set(0, 0, 0);
  weaponModel.rotation.set(0, 0, 0);
  weaponModel.scale.set(1, 1, 1);
  weaponModel.traverse((object) => {
    if (object.isMesh) object.userData.weaponReviewBaseMaterial = object.material;
  });
  weaponModel.updateMatrixWorld(true);

  currentWeapon = weaponModel;
  scene.add(currentWeapon);
  currentWeapon.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(currentWeapon, true);
  if (box.isEmpty()) throw new Error(`Weapon review model has no visible bounds for ${designation}`);
  currentBounds = boundsToRecord(box);

  applyModelAppearance();
  resetCameras();
  for (const viewKey of Object.keys(blueprintViews)) applyBlueprintAppearance(viewKey);
}

function syncBlueprintControlValues(viewKey) {
  const blueprint = blueprintViews[viewKey];
  const { inputs, opacityOutput } = blueprint.controls;
  const state = blueprint.state;
  inputs.opacity.value = String(state.opacity);
  opacityOutput.value = state.opacity.toFixed(2);
  inputs.mirrorX.checked = state.mirrorX;
}

function readBlueprintControlValues(viewKey) {
  const blueprint = blueprintViews[viewKey];
  const { inputs } = blueprint.controls;
  blueprint.state = normalizeWeaponReviewOverlayState({
    ...blueprint.state,
    opacity: inputs.opacity.value,
    mirrorX: inputs.mirrorX.checked,
    crop: blueprint.state.crop
  });
  syncBlueprintControlValues(viewKey);
  applyBlueprintAppearance(viewKey);
}

function disposeBlueprint(viewKey) {
  const blueprint = blueprintViews[viewKey];
  if (blueprint.mesh) {
    blueprint.mesh.material.map?.dispose();
    disposeObject(blueprint.mesh);
    blueprint.mesh = null;
  }
  blueprint.controls.details.hidden = true;
  blueprint.root.closest('.view-cell')?.classList.remove('blueprint-touch-active');
  blueprint.pointers.clear();
  blueprint.gesture = null;
  blueprint.controls.status.textContent = 'No blueprint loaded';
  blueprint.controls.fileButtonText.textContent = `Load ${blueprint.label.toLowerCase()} blueprint`;
  blueprint.controls.fileInput.value = '';
  blueprint.state = normalizeWeaponReviewOverlayState();
  blueprint.initialState = blueprint.state;
  blueprint.sourceKind = null;
  const viewCell = blueprint.root.closest('.view-cell');
  if (viewCell) delete viewCell.dataset.blueprintSource;
}

function installBlueprintTexture(viewKey, texture, sourceLabel, {
  state = blueprintViews[viewKey].state,
  sourceKind = 'manual'
} = {}) {
  const blueprint = blueprintViews[viewKey];
  blueprint.state = normalizeWeaponReviewOverlayState(state);
  blueprint.initialState = blueprint.state;
  blueprint.sourceKind = sourceKind;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  blueprint.imageWidth = texture.image.width;
  blueprint.imageHeight = texture.image.height;

  if (blueprint.mesh) {
    blueprint.mesh.material.map?.dispose();
    blueprint.mesh.material.map = texture;
    blueprint.mesh.material.needsUpdate = true;
  } else {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: blueprint.state.opacity,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    configureBlueprintOrientation(viewKey, mesh);
    scene.add(mesh);
    blueprint.mesh = mesh;
  }

  blueprint.controls.details.hidden = false;
  blueprint.root.closest('.view-cell')?.classList.toggle(
    'blueprint-touch-active',
    blueprint.touchAdjust
  );
  blueprint.controls.status.textContent = sourceLabel;
  blueprint.controls.status.title = sourceLabel;
  blueprint.controls.fileButtonText.textContent = 'Replace blueprint';
  blueprint.root.closest('.view-cell').dataset.blueprintSource = sourceKind;
  syncBlueprintControlValues(viewKey);
  applyBlueprintAppearance(viewKey);
}

function loadTexture(source) {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      source,
      resolve,
      undefined,
      () => reject(new Error('Image could not be decoded'))
    );
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(new Error('Blueprint file could not be read')), {
      once: true
    });
    reader.readAsDataURL(file);
  });
}

function assertSafeSvgDocument(svgText) {
  const svgDocument = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (svgDocument.querySelector('parsererror')) throw new Error('SVG blueprint is malformed');
  const root = svgDocument.documentElement;
  if (root?.localName?.toLowerCase() !== 'svg') throw new Error('File is not an SVG document');

  const elements = [...svgDocument.getElementsByTagName('*')];
  if (elements.length > 50000) throw new Error('SVG blueprint is too complex');
  const forbiddenElements = new Set([
    'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video'
  ]);
  const assertInternalCssUrls = (value) => {
    if (/javascript\s*:|@import\b/i.test(value)) {
      throw new Error('SVG blueprint contains executable or imported content');
    }
    for (const match of value.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/gi)) {
      if (!match[1].startsWith('#')) throw new Error('SVG blueprint references an external resource');
    }
  };

  for (const element of elements) {
    const elementName = element.localName.toLowerCase();
    if (forbiddenElements.has(elementName)) {
      throw new Error(`SVG blueprint contains forbidden <${element.localName}> content`);
    }
    if (elementName === 'style') assertInternalCssUrls(element.textContent ?? '');
    for (const attribute of element.attributes) {
      const attributeName = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (attributeName.startsWith('on')) {
        throw new Error('SVG blueprint contains an event handler');
      }
      if (attributeName === 'href' || attributeName.endsWith(':href')) {
        const embeddedRaster = elementName === 'image'
          && /^data:image\/(png|jpeg|webp);base64,/i.test(value);
        if (!value.startsWith('#') && !embeddedRaster) {
          throw new Error('SVG blueprint references an external resource');
        }
      }
      assertInternalCssUrls(value);
    }
  }
  return svgDocument;
}

function readSvgDimensions(svgDocument) {
  const root = svgDocument.documentElement;
  const viewBox = root.getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth = viewBox?.length === 4 ? viewBox[2] : NaN;
  const viewBoxHeight = viewBox?.length === 4 ? viewBox[3] : NaN;
  const width = Number.isFinite(viewBoxWidth) && viewBoxWidth > 0
    ? viewBoxWidth
    : Number.parseFloat(root.getAttribute('width'));
  const height = Number.isFinite(viewBoxHeight) && viewBoxHeight > 0
    ? viewBoxHeight
    : Number.parseFloat(root.getAttribute('height'));
  if (!(width > 0 && height > 0)) throw new Error('SVG blueprint has no usable dimensions');
  return { width, height };
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('SVG blueprint could not be decoded')), {
      once: true
    });
    image.src = source;
  });
}

async function createSvgCanvas(file) {
  const svgDocument = assertSafeSvgDocument(await file.text());
  const sourceSize = readSvgDimensions(svgDocument);
  const rasterSize = resolveWeaponReviewSvgRasterSize(
    sourceSize.width,
    sourceSize.height,
    window.devicePixelRatio
  );
  const svgMarkup = new XMLSerializer().serializeToString(svgDocument);
  const objectUrl = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml' }));
  try {
    const image = await loadImageElement(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = rasterSize.width;
    canvas.height = rasterSize.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable for SVG blueprints');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function createRasterCanvas(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable for raster blueprints');
    context.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function createSvgTexture(file) {
  return new THREE.CanvasTexture(await createSvgCanvas(file));
}

function createCroppedCanvasTexture(sourceCanvas, sourceCrop, physicalAspect) {
  const sourceX = Math.floor(sourceCrop.left * sourceCanvas.width);
  const sourceY = Math.floor(sourceCrop.top * sourceCanvas.height);
  const sourceRight = Math.ceil((1 - sourceCrop.right) * sourceCanvas.width);
  const sourceBottom = Math.ceil((1 - sourceCrop.bottom) * sourceCanvas.height);
  const sourceWidth = Math.max(1, sourceRight - sourceX);
  const sourceHeight = Math.max(1, sourceBottom - sourceY);
  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  canvas.height = Math.max(1, Math.round(sourceWidth / physicalAspect));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable for blueprint cropping');
  context.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return new THREE.CanvasTexture(canvas);
}

async function loadBlueprintFile(viewKey, file) {
  const blueprint = blueprintViews[viewKey];
  blueprint.controls.status.textContent = 'Loading...';
  blueprint.controls.status.title = '';
  try {
    const kind = resolveWeaponReviewBlueprintFileKind(file);
    const texture = kind === 'svg'
      ? await createSvgTexture(file)
      : await loadTexture(await readFileAsDataUrl(file));
    installBlueprintTexture(viewKey, texture, file.name, {
      state: normalizeWeaponReviewOverlayState(),
      sourceKind: 'manual'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Blueprint load failed';
    blueprint.controls.status.textContent = message;
    blueprint.controls.status.title = message;
    console.warn(`[weapon-review] ${message}`);
  }
}

async function loadBundledMas36Blueprint(generation) {
  const response = await fetch(MAS36_BLUEPRINT_URL);
  if (!response.ok) throw new Error(`MAS-36 blueprint request failed (${response.status})`);
  const sourceCanvas = await createSvgCanvas(await response.blob());
  if (generation !== selectionGeneration || currentDesignation !== 'MAS-36 Rifle') return;

  const registration = MAS36_VISUAL_DATA.source.registrationRaster;
  for (const [viewKey, preset] of Object.entries(MAS36_VISUAL_DATA.reviewBlueprint.views)) {
    const resolved = resolveWeaponReviewBlueprintPreset(currentBounds, {
      ...preset,
      imageSize: [registration.rasterWidth, registration.rasterHeight],
      metresPerSourcePixel: MAS36_VISUAL_DATA.reviewBlueprint.metresPerSourcePixel
    });
    const texture = createCroppedCanvasTexture(
      sourceCanvas,
      resolved.sourceCrop,
      resolved.physicalSize[0] / resolved.physicalSize[1]
    );
    installBlueprintTexture(
      viewKey,
      texture,
      `${MAS36_VISUAL_DATA.reviewBlueprint.sourceLabel} · aligned ${preset.view}`,
      { state: resolved.state, sourceKind: 'bundled' }
    );
  }
  document.body.dataset.blueprintPreset = 'mas36-side-top';
}

async function loadBundledBerthierBlueprint(generation) {
  const response = await fetch(BERTHIER_M1892_M16_BLUEPRINT_URL);
  if (!response.ok) throw new Error(`Berthier blueprint request failed (${response.status})`);
  const sourceCanvas = await createRasterCanvas(await response.blob());
  if (
    generation !== selectionGeneration
    || currentDesignation !== 'Berthier Mousqueton Mle 1892 M16'
  ) return;

  for (const [viewKey, preset] of Object.entries(
    BERTHIER_M1892_M16_VISUAL_DATA.reviewBlueprint.views
  )) {
    const resolved = resolveWeaponReviewBlueprintPreset(currentBounds, {
      ...preset,
      imageSize: BERTHIER_M1892_M16_VISUAL_DATA.source.imageSize,
      metresPerSourcePixel:
        BERTHIER_M1892_M16_VISUAL_DATA.reviewBlueprint.metresPerSourcePixel
    });
    const texture = createCroppedCanvasTexture(
      sourceCanvas,
      resolved.sourceCrop,
      resolved.physicalSize[0] / resolved.physicalSize[1]
    );
    installBlueprintTexture(
      viewKey,
      texture,
      `${BERTHIER_M1892_M16_VISUAL_DATA.reviewBlueprint.sourceLabel} · aligned ${preset.view}`,
      { state: resolved.state, sourceKind: 'bundled' }
    );
  }
  document.body.dataset.blueprintPreset = 'berthier-m1892-m16-side';
}

async function loadReviewSelection(designation) {
  const generation = ++selectionGeneration;
  for (const [viewKey, blueprint] of Object.entries(blueprintViews)) {
    if (blueprint.sourceKind === 'bundled') disposeBlueprint(viewKey);
  }
  delete document.body.dataset.blueprintPreset;
  currentDesignation = designation;
  loadWeapon(designation);
  try {
    if (designation === 'MAS-36 Rifle') {
      await loadBundledMas36Blueprint(generation);
    } else if (designation === 'Berthier Mousqueton Mle 1892 M16') {
      await loadBundledBerthierBlueprint(generation);
    }
  } catch (error) {
    const data = designation === 'MAS-36 Rifle'
      ? MAS36_VISUAL_DATA
      : BERTHIER_M1892_M16_VISUAL_DATA;
    const message = error instanceof Error ? error.message : `${designation} blueprint load failed`;
    for (const viewKey of Object.keys(data.reviewBlueprint.views)) {
      blueprintViews[viewKey].controls.status.textContent = message;
      blueprintViews[viewKey].controls.status.title = message;
    }
    console.warn(`[weapon-review] ${message}`);
  }
}

function initializeBlueprintControls() {
  for (const [viewKey, blueprint] of Object.entries(blueprintViews)) {
    blueprint.root.innerHTML = `
      <div class="blueprint-load-row">
        <label class="blueprint-file-button">
          <span>Load ${blueprint.label.toLowerCase()} blueprint</span>
          <input class="blueprint-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg">
        </label>
        <span class="blueprint-status">No blueprint loaded</span>
      </div>
      <div class="blueprint-overlay-controls" hidden>
        <div class="overlay-control-body">
          <label class="overlay-field">Blueprint opacity
            <span class="overlay-range">
              <input data-field="opacity" type="range" min="0" max="1" value="0.65" step="0.01">
              <output data-output="opacity">0.65</output>
            </span>
          </label>
          <label class="overlay-check">
            <input data-field="mirrorX" type="checkbox"> Mirror blueprint
          </label>
          <p class="touch-adjust-note">Drag to move. Pinch to resize. Twist to rotate.</p>
          <div class="overlay-actions">
            <button data-action="reset" type="button">Reset</button>
            <button data-action="remove" type="button">Remove</button>
          </div>
        </div>
      </div>
    `;

    const details = blueprint.root.querySelector('.blueprint-overlay-controls');
    const fileInput = blueprint.root.querySelector('.blueprint-file-input');
    const fileButtonText = blueprint.root.querySelector('.blueprint-file-button span');
    const status = blueprint.root.querySelector('.blueprint-status');
    const inputs = Object.fromEntries(
      [...blueprint.root.querySelectorAll('[data-field]')].map((input) => [input.dataset.field, input])
    );
    blueprint.controls = {
      details,
      fileInput,
      fileButtonText,
      status,
      inputs,
      opacityOutput: blueprint.root.querySelector('[data-output="opacity"]')
    };

    blueprint.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    blueprint.root.addEventListener('wheel', (event) => event.stopPropagation());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      await loadBlueprintFile(viewKey, file);
    });
    for (const input of Object.values(inputs)) {
      input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
        readBlueprintControlValues(viewKey);
      });
    }
    blueprint.root.querySelector('[data-action="reset"]').addEventListener('click', () => {
      blueprint.state = blueprint.initialState;
      syncBlueprintControlValues(viewKey);
      applyBlueprintAppearance(viewKey);
    });
    blueprint.root.querySelector('[data-action="remove"]').addEventListener('click', () => {
      disposeBlueprint(viewKey);
    });
    syncBlueprintControlValues(viewKey);
  }
}

initializeBlueprintControls();

function blueprintOwnsTouch(blueprint, event) {
  return (
    event.pointerType === 'touch'
    && blueprint.touchAdjust
    && Boolean(blueprint.mesh)
    && !event.target.closest('.blueprint-tools, .view-action-button')
  );
}

function initializeCameraTouchRouter() {
  let activeView = null;
  const activePointers = new Set();
  const blockedPointers = new Set();
  const consume = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const setActiveView = (view) => {
    activeView = view;
    for (const candidate of views) candidate.controls.enabled = !view || candidate === view;
  };

  for (const view of views) {
    const blueprint = Object.values(blueprintViews).find((candidate) => candidate.view === view);
    view.container.addEventListener('pointerdown', (event) => {
      if (
        event.pointerType !== 'touch'
        || event.target.closest('.blueprint-tools, .view-action-button')
        || (blueprint && blueprintOwnsTouch(blueprint, event))
      ) return;
      if (activeView && activeView !== view) {
        blockedPointers.add(event.pointerId);
        consume(event);
        return;
      }
      setActiveView(view);
      activePointers.add(event.pointerId);
    }, { capture: true });
  }

  document.addEventListener('pointermove', (event) => {
    if (
      event.pointerType === 'touch'
      && activeView
      && !activePointers.has(event.pointerId)
    ) consume(event);
  }, { capture: true });

  const finishPointer = (event) => {
    if (blockedPointers.delete(event.pointerId)) {
      consume(event);
      return;
    }
    if (!activePointers.delete(event.pointerId) || activePointers.size > 0) return;
    setTimeout(() => {
      if (activePointers.size === 0) setActiveView(null);
    }, 0);
  };
  document.addEventListener('pointerup', finishPointer, { capture: true });
  document.addEventListener('pointercancel', finishPointer, { capture: true });
}

function getTouchMetrics(points) {
  const positions = [...points.values()];
  if (positions.length === 0) return null;
  const first = positions[0];
  const second = positions[1] ?? first;
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  return {
    count: positions.length,
    center: [(first.x + second.x) * 0.5, (first.y + second.y) * 0.5],
    distance: positions.length > 1 ? Math.hypot(deltaX, deltaY) : 1,
    angle: positions.length > 1 ? Math.atan2(deltaY, deltaX) : 0
  };
}

function beginBlueprintGesture(blueprint) {
  const metrics = getTouchMetrics(blueprint.pointers);
  blueprint.gesture = metrics
    ? { state: blueprint.state, metrics, intent: 'pending' }
    : null;
}

function applyBlueprintGesture(blueprint) {
  const current = getTouchMetrics(blueprint.pointers);
  const start = blueprint.gesture;
  const camera = blueprint.view?.camera;
  const container = blueprint.view?.container;
  if (!current || !start || !camera?.isOrthographicCamera || !container) return;
  const rect = container.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return;

  const hasPinch = current.count > 1 && start.metrics.count > 1;
  const rotationDelta = hasPinch
    ? Math.atan2(
      Math.sin(current.angle - start.metrics.angle),
      Math.cos(current.angle - start.metrics.angle)
    )
    : 0;
  const pinch = resolveWeaponReviewPinchGesture(
    hasPinch ? current.distance / Math.max(1, start.metrics.distance) : 1,
    rotationDelta,
    start.intent
  );
  start.intent = pinch.intent;
  blueprint.state = applyWeaponReviewBlueprintTouchGesture(start.state, {
    deltaPixels: [
      current.center[0] - start.metrics.center[0],
      current.center[1] - start.metrics.center[1]
    ],
    viewportPixels: [rect.width, rect.height],
    frameMeters: [
      (camera.right - camera.left) / camera.zoom,
      (camera.top - camera.bottom) / camera.zoom
    ],
    scaleRatio: pinch.scaleRatio,
    rotationDeltaRadians: pinch.rotationDeltaRadians
  });
  syncBlueprintControlValues(blueprint.root.dataset.viewKey);
  applyBlueprintAppearance(blueprint.root.dataset.viewKey);
}

function initializeBlueprintTouchGestures() {
  for (const blueprint of Object.values(blueprintViews)) {
    const container = blueprint.view?.container;
    if (!container) continue;
    const consume = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    container.addEventListener('pointerdown', (event) => {
      if (!blueprintOwnsTouch(blueprint, event)) return;
      consume(event);
      blueprint.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      container.setPointerCapture(event.pointerId);
      beginBlueprintGesture(blueprint);
    }, { capture: true });

    container.addEventListener('pointermove', (event) => {
      if (!blueprint.pointers.has(event.pointerId)) return;
      consume(event);
      blueprint.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      applyBlueprintGesture(blueprint);
    }, { capture: true });

    const finishPointer = (event) => {
      if (!blueprint.pointers.has(event.pointerId)) return;
      consume(event);
      blueprint.pointers.delete(event.pointerId);
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
      beginBlueprintGesture(blueprint);
    };
    container.addEventListener('pointerup', finishPointer, { capture: true });
    container.addEventListener('pointercancel', finishPointer, { capture: true });
  }
}

initializeCameraTouchRouter();
initializeBlueprintTouchGestures();

document.getElementById('weapon-select').addEventListener('change', (event) => {
  void loadReviewSelection(event.target.value);
});

renderModeSelect.addEventListener('change', () => {
  renderMode = WEAPON_REVIEW_RENDER_MODES.includes(renderModeSelect.value)
    ? renderModeSelect.value
    : 'overlay';
  applyModelAppearance();
});

modelOpacityInput.addEventListener('input', () => applyModelAppearance());
applyModelAppearance();

function applyMaximizedView(nextViewId) {
  maximizedViewId = nextViewId;
  viewGrid.classList.toggle('is-maximized', nextViewId !== null);
  document.body.classList.toggle('has-maximized-view', nextViewId !== null);
  if (nextViewId === null) delete document.body.dataset.maximizedView;
  else document.body.dataset.maximizedView = nextViewId;

  for (const view of views) {
    const isMaximized = view.containerId === nextViewId;
    view.container.classList.toggle('is-maximized', isMaximized);
    const button = view.container.querySelector('.view-fullscreen-button');
    button.setAttribute('aria-pressed', String(isMaximized));
    button.textContent = isMaximized ? 'Exit' : 'Full';
    button.setAttribute(
      'aria-label',
      isMaximized ? 'Exit fullscreen view' : `View ${view.containerId} fullscreen`
    );
  }
  scheduleViewportLayout(true);
}

async function toggleMaximizedView(requestedViewId) {
  const nextViewId = resolveWeaponReviewMaximizedView(
    maximizedViewId,
    requestedViewId,
    viewIds
  );
  applyMaximizedView(nextViewId);

  try {
    if (nextViewId !== null && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else if (nextViewId === null && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // CSS maximization remains available when browser fullscreen is blocked.
  }
}

for (const button of document.querySelectorAll('.axis-flip-button')) {
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const view = views.find((candidate) => candidate.containerId === button.dataset.viewId);
    if (!view?.calibrationView || !currentBounds) return;
    view.cameraDirection *= -1;
    applyOrthographicCamera(view, getViewAspect(view.container));
    const blueprint = Object.values(blueprintViews).find((candidate) => candidate.view === view);
    if (blueprint) applyBlueprintAppearance(blueprint.root.dataset.viewKey);
  });
}

for (const button of document.querySelectorAll('.view-fullscreen-button')) {
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMaximizedView(button.dataset.viewId);
  });
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && maximizedViewId !== null) applyMaximizedView(null);
  scheduleViewportLayout(true);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && maximizedViewId !== null && !document.fullscreenElement) {
    applyMaximizedView(null);
  }
});

function renderFrame() {
  animationFrame = requestAnimationFrame(renderFrame);
  renderer.setScissorTest(true);

  const rendererRect = rendererHost.getBoundingClientRect();
  for (const view of views) {
    const viewport = rectToWeaponReviewViewport(
      view.container.getBoundingClientRect(),
      rendererRect
    );
    if (viewport.width <= 0 || viewport.height <= 0) continue;
    const aspect = viewport.width / viewport.height;
    if (view.calibrationView) applyOrthographicProjection(view, aspect);
    else {
      view.camera.aspect = aspect;
      view.camera.updateProjectionMatrix();
    }

    renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
    renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
    renderer.render(scene, view.camera);
  }
}

async function start() {
  try {
    applyViewportLayout();
    renderer = createRenderer(false);
    try {
      await renderer.init();
    } catch (initialError) {
      if (renderer.backend?.isWebGLBackend) throw initialError;
      console.warn('[weapon-review] WebGPU initialization failed; using WebGL2 fallback.', initialError);
      renderer.dispose();
      renderer = createRenderer(true);
      await renderer.init();
    }

    document.body.dataset.rendererBackend = renderer.backend?.isWebGPUBackend
      ? 'webgpu'
      : renderer.backend?.isWebGLBackend
        ? 'webgl2-fallback'
        : 'unknown';
    await loadReviewSelection(document.getElementById('weapon-select').value);
    applyViewportLayout();
    document.body.dataset.gameStatus = 'ready';
    renderFrame();
  } catch (error) {
    document.body.dataset.gameStatus = 'error';
    document.body.dataset.gameError = error instanceof Error ? error.message : String(error);
    console.error('[weapon-review] Failed to initialize.', error);
  }
}

const resizeViewport = () => scheduleViewportLayout(true);
window.addEventListener('resize', resizeViewport);
window.addEventListener('orientationchange', resizeViewport);
window.visualViewport?.addEventListener('resize', resizeViewport);
window.visualViewport?.addEventListener('scroll', resizeViewport);
const toolbarResizeObserver = new ResizeObserver(() => scheduleViewportLayout(false));
toolbarResizeObserver.observe(toolbar);

window.addEventListener('pagehide', () => {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  if (viewportLayoutFrame !== null) cancelAnimationFrame(viewportLayoutFrame);
  for (const timeout of viewportSettleTimeouts) clearTimeout(timeout);
  toolbarResizeObserver.disconnect();
  for (const view of views) view.controls.dispose();
  disposeObject(currentWeapon);
  for (const viewKey of Object.keys(blueprintViews)) disposeBlueprint(viewKey);
  for (const material of persistentMaterials) material.dispose();
  renderer?.dispose();
});

start();
