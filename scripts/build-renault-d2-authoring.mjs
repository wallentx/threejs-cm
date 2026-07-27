import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import {
  createParametricVehicleMesh
} from '../src/authoring/vehicle/ParametricVehicleCompiler.js';
import {
  createOrthographicFrame
} from '../src/calibration/CalibrationMath.js';
import {
  setCalibrationLodVisibility
} from '../src/calibration/CalibrationModel.js';
import {
  renderVehicleSilhouetteSvg
} from '../src/calibration/SoftwareSilhouette.js';
import {
  RENAULT_D2_AUTHORING_DATA
} from '../src/content/france1940/vehicleData/RenaultD2AuthoringData.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(
  ROOT,
  'docs',
  'vehicle-authoring',
  'renault-d2',
  'generated'
);
const SOURCE_IMAGE = path.join(
  ROOT,
  'public',
  'assets',
  'blueprints',
  'france1940',
  'renault-d2-tourelle-apx-4.png'
);
let sourceImageHref = '../../../../public/assets/blueprints/france1940/renault-d2-tourelle-apx-4.png';
const VIEW_WIDTH = 1400;
const VIEW_HEIGHT = 900;
const LODS = Object.freeze(['high', 'medium', 'core', 'proxy']);
const VIEWS = Object.freeze(['side', 'front', 'top']);
const COLORS = Object.freeze({
  runningGear: '#f97316',
  tracks: '#f97316',
  tracksAndMudguards: '#f97316',
  hull: '#22c55e',
  turret: '#3b82f6',
  mantlet: '#eab308',
  mantletAndGun: '#eab308',
  engineCooling: '#a855f7',
  engineDeck: '#a855f7'
});

const sha256 = content => createHash('sha256').update(content).digest('hex');
const escapeXml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function parseOutputArgument(argv) {
  if (argv.length === 0) return DEFAULT_OUTPUT;
  if (argv.length !== 2 || argv[0] !== '--output') {
    throw new Error('Usage: node scripts/build-renault-d2-authoring.mjs [--output <directory>]');
  }
  return path.resolve(argv[1]);
}

async function verifySourceImage() {
  const source = await readFile(SOURCE_IMAGE);
  const expected = RENAULT_D2_AUTHORING_DATA.blueprint.sourceRecords[0].sha256;
  const actual = sha256(source);
  if (actual !== expected) {
    throw new Error(`Renault D2 source image SHA-256 mismatch: ${actual}`);
  }
  return source;
}

function polygonMarkup(name, points) {
  const color = COLORS[name] ?? '#ef4444';
  const coordinates = points.map(point => point.join(',')).join(' ');
  const center = points.reduce(
    (sum, point) => [
      sum[0] + point[0] / points.length,
      sum[1] + point[1] / points.length
    ],
    [0, 0]
  );
  return [
    `<polygon points="${coordinates}" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`,
    `<text x="${center[0]}" y="${center[1]}" text-anchor="middle" fill="${color}" font-family="sans-serif" font-size="15" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeXml(name)}</text>`
  ].join('');
}

function circleMarkup(circle) {
  const [cx, cy] = circle.centerPixels;
  const color = circle.kind === 'roadWheel'
    ? '#06b6d4'
    : circle.kind === 'returnRoller'
      ? '#8b5cf6'
      : '#ef4444';
  return [
    `<circle cx="${cx}" cy="${cy}" r="${circle.radiusPixels}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>`,
    `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${color}"/>`
  ].join('');
}

function landmarkMarkup(name, point) {
  const [x, y] = point;
  return [
    `<path d="M${x - 7},${y}H${x + 7}M${x},${y - 7}V${y + 7}" stroke="#dc2626" stroke-width="2" vector-effect="non-scaling-stroke"/>`,
    `<text x="${x + 9}" y="${y - 8}" fill="#991b1b" font-family="sans-serif" font-size="12" paint-order="stroke" stroke="#fff" stroke-width="3">${escapeXml(name)}</text>`
  ].join('');
}

function renderBlueprintReviewSvg(viewName, view) {
  const crop = view.cropPixels;
  const polygons = Object.entries(view.componentPolygons ?? {})
    .map(([name, points]) => polygonMarkup(name, points))
    .join('');
  const circles = (view.circles ?? []).map(circleMarkup).join('');
  const landmarks = Object.entries(view.landmarks ?? {})
    .map(([name, point]) => landmarkMarkup(name, point))
    .join('');
  const status = view.rigidRegistration
    ? 'LLM registration: metre-scaled; human review required'
    : view.registrationStatus;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${crop.width}" height="${crop.height}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}">`,
    '<rect x="0" y="0" width="1573" height="2133" fill="#fff"/>',
    `<image href="${sourceImageHref}" x="0" y="0" width="1573" height="2133"/>`,
    polygons,
    circles,
    landmarks,
    `<rect x="${crop.x + 6}" y="${crop.y + crop.height - 33}" width="${Math.min(crop.width - 12, 540)}" height="25" rx="4" fill="#fff" fill-opacity="0.88"/>`,
    `<text x="${crop.x + 14}" y="${crop.y + crop.height - 15}" fill="#111827" font-family="sans-serif" font-size="14">${escapeXml(viewName)} - ${escapeXml(status)}</text>`,
    '</svg>',
    ''
  ].join('');
}

function sourceImageMatrix(viewName, frame) {
  const view = RENAULT_D2_AUTHORING_DATA.blueprint.views[viewName];
  const registration = view.rigidRegistration;
  if (viewName === 'side') {
    const a = registration.horizontalMetersPerPixel * VIEW_WIDTH / frame.width;
    const d = registration.verticalMetersPerPixel * VIEW_HEIGHT / frame.height;
    const e = (
      -registration.originPixelX * registration.horizontalMetersPerPixel
      - frame.left
    ) * VIEW_WIDTH / frame.width;
    const f = (
      frame.top
      - registration.groundLinePixelY * registration.verticalMetersPerPixel
    ) * VIEW_HEIGHT / frame.height;
    return [a, 0, 0, d, e, f];
  }
  if (viewName === 'front') {
    const a = registration.horizontalMetersPerPixel * VIEW_WIDTH / frame.width;
    const d = registration.verticalMetersPerPixel * VIEW_HEIGHT / frame.height;
    const e = (
      -registration.originPixelX * registration.horizontalMetersPerPixel
      - frame.left
    ) * VIEW_WIDTH / frame.width;
    const f = (
      frame.top
      - registration.groundLinePixelY * registration.verticalMetersPerPixel
    ) * VIEW_HEIGHT / frame.height;
    return [a, 0, 0, d, e, f];
  }
  const c = registration.lateralMetersPerPixel * VIEW_WIDTH / frame.width;
  const b = registration.longitudinalMetersPerPixel * VIEW_HEIGHT / frame.height;
  const e = (
    -registration.originPixelY * registration.lateralMetersPerPixel
    - frame.left
  ) * VIEW_WIDTH / frame.width;
  const f = (
    frame.top
    - registration.originPixelX * registration.longitudinalMetersPerPixel
  ) * VIEW_HEIGHT / frame.height;
  return [0, b, c, 0, e, f];
}

function renderOverlaySvg(viewName, silhouetteResult) {
  const sourceCrop = RENAULT_D2_AUTHORING_DATA.blueprint.views[viewName].cropPixels;
  const frame = createOrthographicFrame(
    RENAULT_D2_AUTHORING_DATA.dimensionsMeters,
    viewName,
    VIEW_WIDTH / VIEW_HEIGHT
  );
  const matrix = sourceImageMatrix(viewName, frame)
    .map(value => value.toFixed(10))
    .join(' ');
  const silhouetteGroup = silhouetteResult.svg.match(/<g[\s\S]*?<\/g>/)?.[0];
  const envelope = silhouetteResult.svg.match(/<rect[^>]+stroke="#dc2626"[^>]*\/>/)?.[0] ?? '';
  if (!silhouetteGroup) throw new Error(`missing silhouette group for ${viewName}`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}">`,
    `<defs><clipPath id="source-${viewName}"><rect x="${sourceCrop.x}" y="${sourceCrop.y}" width="${sourceCrop.width}" height="${sourceCrop.height}"/></clipPath></defs>`,
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="#fff"/>`,
    `<image href="${sourceImageHref}" x="0" y="0" width="1573" height="2133" transform="matrix(${matrix})" clip-path="url(#source-${viewName})" opacity="0.52"/>`,
    silhouetteGroup
      .replace('<g ', '<g opacity="0.47" ')
      .replaceAll('#101820', '#00a6a6'),
    envelope,
    `<text x="24" y="36" fill="#111827" font-family="sans-serif" font-size="20" font-weight="700">Renault D2 ${viewName}: blueprint + generated high LOD</text>`,
    `<text x="24" y="64" fill="#374151" font-family="sans-serif" font-size="15">cyan = generated geometry; black = secondary drawing; red = published rigid envelope</text>`,
    '</svg>',
    ''
  ].join('');
}

function hideFlexibleAttachments(model) {
  model.traverse(object => {
    if (object.userData.envelopeRole === 'flexibleAttachment') {
      object.visible = false;
    }
  });
}

function installFileReaderPolyfill() {
  if (typeof globalThis.FileReader !== 'undefined') return;
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(result => {
        this.result = result;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      }).catch(error => this.onerror?.(error));
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then(buffer => {
        const mime = blob.type || 'application/octet-stream';
        this.result = `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      }).catch(error => this.onerror?.(error));
    }
  };
}

function exportSafeValue(value, seen = new Set()) {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'undefined' || typeof value === 'function') return undefined;
  if (
    value?.isObject3D
    || value?.isMaterial
    || value?.isBufferGeometry
    || value?.isTexture
  ) {
    return undefined;
  }
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value
      .map(child => exportSafeValue(child, seen))
      .filter(child => typeof child !== 'undefined');
    seen.delete(value);
    return result;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    seen.delete(value);
    return undefined;
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const child = exportSafeValue(value[key], seen);
    if (typeof child !== 'undefined') result[key] = child;
  }
  seen.delete(value);
  return result;
}

function sanitizeGlbExtras(root) {
  root.traverse(object => {
    object.userData = exportSafeValue(object.userData) ?? {};
  });
}

async function exportModels(outputDirectory) {
  const model = createParametricVehicleMesh(RENAULT_D2_AUTHORING_DATA);
  setCalibrationLodVisibility(model, 'high');
  model.updateMatrixWorld(true);

  const obj = new OBJExporter().parse(model);
  const stl = new STLExporter().parse(model, { binary: false });
  await writeFile(path.join(outputDirectory, 'renault-d2-high.obj'), obj);
  await writeFile(path.join(outputDirectory, 'renault-d2-high.stl'), stl);

  installFileReaderPolyfill();
  const glbModel = createParametricVehicleMesh(RENAULT_D2_AUTHORING_DATA);
  sanitizeGlbExtras(glbModel);
  glbModel.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(glbModel, {
    binary: true,
    onlyVisible: false,
    trs: false
  });
  await writeFile(
    path.join(outputDirectory, 'renault-d2-all-lods.glb'),
    Buffer.from(glb)
  );
}

async function build() {
  const outputDirectory = parseOutputArgument(process.argv.slice(2));
  const sourceImage = await verifySourceImage();
  sourceImageHref = `data:image/png;base64,${sourceImage.toString('base64')}`;
  await mkdir(outputDirectory, { recursive: true });

  for (const [viewName, view] of Object.entries(
    RENAULT_D2_AUTHORING_DATA.blueprint.views
  )) {
    await writeFile(
      path.join(outputDirectory, `blueprint-${viewName}.svg`),
      renderBlueprintReviewSvg(viewName, view)
    );
  }

  const captureRecords = [];
  for (const lod of LODS) {
    const model = createParametricVehicleMesh(RENAULT_D2_AUTHORING_DATA);
    setCalibrationLodVisibility(model, lod);
    hideFlexibleAttachments(model);
    for (const view of VIEWS) {
      const result = renderVehicleSilhouetteSvg(
        model,
        RENAULT_D2_AUTHORING_DATA.dimensionsMeters,
        view,
        {
          width: VIEW_WIDTH,
          height: VIEW_HEIGHT,
          background: '#ffffff',
          silhouette: '#101820',
          showEnvelope: true,
          wireframe: false
        }
      );
      const fileName = `model-${view}-${lod}.svg`;
      await writeFile(path.join(outputDirectory, fileName), result.svg);
      captureRecords.push({
        key: `${view}:${lod}`,
        fileName,
        triangleCount: result.manifest.triangleCount,
        projectedBoundsMeters: result.manifest.projectedBoundsMeters,
        svgSha256: sha256(result.svg)
      });
      if (lod === 'high') {
        await writeFile(
          path.join(outputDirectory, `overlay-${view}.svg`),
          renderOverlaySvg(view, result)
        );
      }
    }
  }

  await exportModels(outputDirectory);
  const generatedFiles = [
    ...Object.keys(RENAULT_D2_AUTHORING_DATA.blueprint.views)
      .map(view => `blueprint-${view}.svg`),
    ...VIEWS.flatMap(view => LODS.map(lod => `model-${view}-${lod}.svg`)),
    ...VIEWS.map(view => `overlay-${view}.svg`),
    'renault-d2-high.obj',
    'renault-d2-high.stl',
    'renault-d2-all-lods.glb'
  ];
  const fileRecords = [];
  for (const fileName of generatedFiles.sort()) {
    const content = await readFile(path.join(outputDirectory, fileName));
    fileRecords.push({
      fileName,
      bytes: content.byteLength,
      sha256: sha256(content)
    });
  }
  const manifest = {
    schemaVersion: 1,
    modelId: RENAULT_D2_AUTHORING_DATA.modelId,
    sourceImageSha256:
      RENAULT_D2_AUTHORING_DATA.blueprint.sourceRecords[0].sha256,
    dimensionsMeters: RENAULT_D2_AUTHORING_DATA.dimensionsMeters,
    renderer: {
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      views: VIEWS,
      lods: LODS,
      flexibleAttachmentsHidden: true
    },
    captureRecords,
    files: fileRecords
  };
  await writeFile(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log(
    `Built Renault D2 authoring packet: ${outputDirectory} (${captureRecords.length} captures)`
  );
}

await build();
