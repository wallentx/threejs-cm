import assert from 'node:assert/strict';
import test from 'node:test';

import { CALIBRATION_VIEWS } from '../src/calibration/CalibrationMath.js';
import { BERTHIER_M1892_M16_VISUAL_DATA } from '../src/content/france1940/render/BerthierM1892M16VisualData.js';
import { MAS36_VISUAL_DATA } from '../src/content/france1940/render/Mas36VisualData.js';
import {
  WEAPON_REVIEW_CAMERA_POSES,
  WEAPON_REVIEW_RENDER_MODES,
  applyWeaponReviewBlueprintTouchGesture,
  createWeaponReviewTextureWindow,
  createWeaponReviewOrthographicFrame,
  createWeaponReviewPerspectiveFrame,
  describeWeaponReviewAxisView,
  normalizeWeaponReviewOverlayState,
  rectToWeaponReviewViewport,
  resolveWeaponReviewContentViewport,
  resolveWeaponReviewBlueprintFileKind,
  resolveWeaponReviewBlueprintPreset,
  resolveWeaponReviewPinchGesture,
  resolveWeaponReviewModelOpacity,
  resolveWeaponReviewMaximizedView,
  resolveWeaponReviewSvgRasterSize,
  resolveWeaponReviewViewportMetrics
} from '../src/debug/WeaponReviewLayout.js';

const BOUNDS = Object.freeze({
  min: Object.freeze([-0.12, -0.20, 0]),
  max: Object.freeze([0.12, 0.18, 1.22])
});
const MAS36_BOUNDS = Object.freeze({
  min: Object.freeze([-0.058, -0.16698920726776123, 0]),
  max: Object.freeze([0.024, 0.033000000268220905, 1.02])
});

test('weapon review follows the live visual viewport across mobile orientation changes', () => {
  const landscape = resolveWeaponReviewViewportMetrics({
    innerWidth: 412,
    innerHeight: 915,
    documentWidth: 412,
    documentHeight: 915,
    visualViewport: { width: 915, height: 368, offsetLeft: 0, offsetTop: 12 }
  });
  assert.deepEqual(landscape, { width: 915, height: 368, offsetLeft: 0, offsetTop: 12 });

  const portrait = resolveWeaponReviewViewportMetrics({
    innerWidth: 915,
    innerHeight: 368,
    documentWidth: 915,
    documentHeight: 368,
    visualViewport: { width: 412, height: 843, offsetLeft: 0, offsetTop: 0 }
  });
  assert.deepEqual(portrait, { width: 412, height: 843, offsetLeft: 0, offsetTop: 0 });
});

test('weapon review content stays above the mobile safe area below its measured toolbar', () => {
  assert.deepEqual(
    resolveWeaponReviewContentViewport(
      { width: 412, height: 843, offsetLeft: 0, offsetTop: 10 },
      124,
      24
    ),
    { top: 122, height: 697, bottomInset: 24 }
  );
});

test('weapon review accepts bounded SVG and existing raster blueprint files', () => {
  assert.equal(resolveWeaponReviewBlueprintFileKind({
    name: 'Fusil modele 1936.svg',
    type: 'image/svg+xml',
    size: 904 * 1024
  }), 'svg');
  assert.equal(resolveWeaponReviewBlueprintFileKind({
    name: 'drawing.svg',
    type: '',
    size: 1024
  }), 'svg');
  assert.equal(resolveWeaponReviewBlueprintFileKind({
    name: 'drawing.webp',
    type: 'image/webp',
    size: 1024
  }), 'raster');
  assert.throws(
    () => resolveWeaponReviewBlueprintFileKind({ name: 'drawing.dxf', size: 1024 }),
    /PNG, JPEG, WebP, or SVG/
  );
  assert.throws(
    () => resolveWeaponReviewBlueprintFileKind({ name: 'huge.svg', size: 6 * 1024 * 1024 }),
    /5 MB/
  );
});

test('weapon review rasterizes vector blueprints sharply within a bounded texture size', () => {
  assert.deepEqual(resolveWeaponReviewSvgRasterSize(841.89, 595.275, 2), {
    width: 2048,
    height: 1448
  });
  assert.deepEqual(resolveWeaponReviewSvgRasterSize(3000, 1000, 2), {
    width: 4096,
    height: 1365
  });
});

test('weapon review registers the supplied MAS-36 side and top crops in model metres', () => {
  const registration = MAS36_VISUAL_DATA.source.registrationRaster;
  const resolved = Object.fromEntries(
    Object.entries(MAS36_VISUAL_DATA.reviewBlueprint.views).map(([viewKey, preset]) => [
      viewKey,
      resolveWeaponReviewBlueprintPreset(MAS36_BOUNDS, {
        ...preset,
        imageSize: [registration.rasterWidth, registration.rasterHeight],
        metresPerSourcePixel: MAS36_VISUAL_DATA.reviewBlueprint.metresPerSourcePixel
      })
    ])
  );

  assert.ok(Math.abs(resolved.tl.physicalSize[0] - 1.0367429805615551) < 1e-12);
  assert.ok(Math.abs(resolved.tl.physicalSize[1] - 0.18505399568034558) < 1e-12);
  assert.equal(resolved.tl.state.mirrorX, false);
  assert.equal(resolved.tl.state.rotationDegrees, 0);
  assert.ok(Math.abs(
    ((MAS36_BOUNDS.min[1] + MAS36_BOUNDS.max[1]) * 0.5 + resolved.tl.state.offsetY)
    - MAS36_VISUAL_DATA.reviewBlueprint.views.tl.planeCenter[1]
  ) < 1e-12);

  assert.ok(Math.abs(resolved.tr.physicalSize[1] - 0.07314038876889849) < 1e-12);
  assert.equal(resolved.tr.state.rotationDegrees, -90);
  assert.equal(resolved.tr.state.mirrorX, false);
  assert.ok(Math.abs(
    ((MAS36_BOUNDS.min[0] + MAS36_BOUNDS.max[0]) * 0.5 - resolved.tr.state.offsetX)
  ) < 1e-12);
  assert.equal(MAS36_VISUAL_DATA.reviewBlueprint.views.bl, undefined);
  assert.match(MAS36_VISUAL_DATA.reviewBlueprint.unsupportedViews.front, /no assembled front/i);
});

test('weapon review metre-registers and mirrors the supplied right-facing Berthier side view', () => {
  const data = BERTHIER_M1892_M16_VISUAL_DATA;
  const resolved = resolveWeaponReviewBlueprintPreset({
    min: [-0.04, -0.19, 0],
    max: [0.04, 0.03, 0.945]
  }, {
    ...data.reviewBlueprint.views.tl,
    imageSize: data.source.imageSize,
    metresPerSourcePixel: data.reviewBlueprint.metresPerSourcePixel
  });
  assert.ok(Math.abs(
    resolved.physicalSize[0]
      - data.source.imageSize[0] * data.reviewBlueprint.metresPerSourcePixel
  ) < 1e-12);
  assert.equal(resolved.state.mirrorX, true);
  assert.equal(resolved.state.rotationDegrees, 0);
  assert.match(data.reviewBlueprint.unsupportedViews.front, /no assembled front/i);
  assert.match(data.reviewBlueprint.unsupportedViews.top, /no assembled top/i);
});

test('weapon review keeps renderer viewports on the same top-left DOM cells as their controls', () => {
  assert.deepEqual(
    rectToWeaponReviewViewport({ left: 0, top: 0, width: 500, height: 400 }),
    { x: 0, y: 0, width: 500, height: 400 }
  );
  assert.deepEqual(
    rectToWeaponReviewViewport({ left: 0, top: 400, width: 500, height: 400 }),
    { x: 0, y: 400, width: 500, height: 400 }
  );
  assert.deepEqual(
    rectToWeaponReviewViewport(
      { left: 12, top: 140, width: 500, height: 400 },
      { left: 12, top: 20 }
    ),
    { x: 0, y: 120, width: 500, height: 400 }
  );
});

test('weapon review locked cameras use the calibration page absolute axes', () => {
  for (const view of ['side', 'front', 'top']) {
    assert.equal(WEAPON_REVIEW_CAMERA_POSES[view].cameraAxis, CALIBRATION_VIEWS[view].cameraAxis);
    assert.equal(WEAPON_REVIEW_CAMERA_POSES[view].screenAxes, CALIBRATION_VIEWS[view].screenAxes);
  }

  assert.deepEqual(WEAPON_REVIEW_CAMERA_POSES.side.positionAxis, [1, 0, 0]);
  assert.deepEqual(WEAPON_REVIEW_CAMERA_POSES.front.positionAxis, [0, 0, 1]);
  assert.deepEqual(WEAPON_REVIEW_CAMERA_POSES.top.positionAxis, [0, 1, 0]);
  assert.deepEqual(WEAPON_REVIEW_CAMERA_POSES.top.up, [0, 0, 1]);
});

test('weapon review orthographic framing contains the complete model at every locked angle', () => {
  const expectedProjectedSize = {
    side: [1.22, 0.38],
    front: [0.24, 0.38],
    top: [0.24, 1.22]
  };

  for (const view of ['side', 'front', 'top']) {
    const frame = createWeaponReviewOrthographicFrame(BOUNDS, view, 1.5);
    const [minimumWidth, minimumHeight] = expectedProjectedSize[view];
    assert.ok(frame.width > minimumWidth, `${view} width includes a margin`);
    assert.ok(frame.height > minimumHeight, `${view} height includes a margin`);
    assert.equal(frame.width / frame.height, 1.5);
    assert.ok(Math.abs(frame.target[0]) < 1e-12);
    assert.ok(Math.abs(frame.target[1] + 0.01) < 1e-12);
    assert.ok(Math.abs(frame.target[2] - 0.61) < 1e-12);
  }
});

test('weapon review axis views flip to the exact opposite camera direction', () => {
  for (const view of ['side', 'front', 'top']) {
    const normal = createWeaponReviewOrthographicFrame(BOUNDS, view, 1.5);
    const flipped = createWeaponReviewOrthographicFrame(BOUNDS, view, 1.5, {
      cameraDirection: -1
    });
    assert.deepEqual(flipped.target, normal.target);
    assert.equal(flipped.width, normal.width);
    assert.equal(flipped.height, normal.height);
    for (let axis = 0; axis < 3; axis += 1) {
      assert.ok(Math.abs(
        (flipped.position[axis] - flipped.target[axis])
        + (normal.position[axis] - normal.target[axis])
      ) < 1e-12);
    }
  }
  assert.equal(describeWeaponReviewAxisView('front', 1).flipLabel, 'Back');
  assert.match(describeWeaponReviewAxisView('front', -1).label, /^BACK/);
  assert.equal(describeWeaponReviewAxisView('top', -1).flipLabel, 'Top');
});

test('weapon review perspective framing starts outside the model and targets its center', () => {
  const frame = createWeaponReviewPerspectiveFrame(BOUNDS, 0.75);
  assert.ok(Math.abs(frame.target[0]) < 1e-12);
  assert.ok(Math.abs(frame.target[1] + 0.01) < 1e-12);
  assert.ok(Math.abs(frame.target[2] - 0.61) < 1e-12);
  assert.ok(frame.distance > frame.radius);
  assert.equal(frame.near, 0.005);
  assert.ok(frame.far > frame.distance);
});

test('weapon review fullscreen state toggles one known view and rejects unknown cells', () => {
  const viewIds = ['cell-tl', 'cell-tr', 'cell-bl', 'cell-br'];
  assert.equal(resolveWeaponReviewMaximizedView(null, 'cell-tl', viewIds), 'cell-tl');
  assert.equal(resolveWeaponReviewMaximizedView('cell-tl', 'cell-tl', viewIds), null);
  assert.equal(resolveWeaponReviewMaximizedView('cell-tl', null, viewIds), null);
  assert.throws(
    () => resolveWeaponReviewMaximizedView(null, 'cell-unknown', viewIds),
    /Unknown weapon review view/
  );
});

test('weapon review exposes the calibration overlay render modes and opacity behavior', () => {
  assert.deepEqual(WEAPON_REVIEW_RENDER_MODES, [
    'overlay',
    'difference',
    'silhouette',
    'wireframe',
    'shaded'
  ]);
  assert.equal(resolveWeaponReviewModelOpacity('', 'overlay'), 0.72);
  assert.equal(resolveWeaponReviewModelOpacity('', 'shaded'), 1);
  assert.equal(resolveWeaponReviewModelOpacity('0.35', 'wireframe'), 0.35);
  assert.equal(resolveWeaponReviewModelOpacity('9', 'overlay'), 0.72);
});

test('weapon review normalizes precise registration controls and bounded crop windows', () => {
  const state = normalizeWeaponReviewOverlayState({
    opacity: 2,
    scale: 0,
    offsetX: 9,
    offsetY: -9,
    rotationDegrees: 250,
    mirrorX: true,
    crop: { left: 0.8, right: 0.8, top: -1, bottom: 0.25 }
  });

  assert.equal(state.opacity, 1);
  assert.equal(state.scale, 0.05);
  assert.equal(state.offsetX, 5);
  assert.equal(state.offsetY, -5);
  assert.equal(state.rotationDegrees, 180);
  assert.equal(state.mirrorX, true);
  assert.ok(Math.abs(state.crop.left + state.crop.right - 0.95) < 1e-12);
  assert.equal(state.crop.top, 0);
  assert.equal(state.crop.bottom, 0.25);
});

test('weapon review crop and mirror controls produce the expected texture window', () => {
  const normal = createWeaponReviewTextureWindow({
    crop: { left: 0.1, right: 0.2, top: 0.25, bottom: 0.15 },
    mirrorX: false
  });
  assert.deepEqual(normal.repeat, [0.7, 0.6]);
  assert.deepEqual(normal.offset, [0.1, 0.15]);

  const mirrored = createWeaponReviewTextureWindow({
    crop: { left: 0.1, right: 0.2, top: 0.25, bottom: 0.15 },
    mirrorX: true
  });
  assert.deepEqual(mirrored.repeat, [-0.7, 0.6]);
  assert.deepEqual(mirrored.offset, [0.8, 0.15]);
});

test('weapon review touch gestures translate, pinch-scale, and rotate in view metres', () => {
  const result = applyWeaponReviewBlueprintTouchGesture(
    normalizeWeaponReviewOverlayState({
      scale: 1,
      offsetX: 0.1,
      offsetY: -0.2,
      rotationDegrees: 10
    }),
    {
      deltaPixels: [40, 20],
      viewportPixels: [400, 200],
      frameMeters: [2, 1],
      scaleRatio: 1.5,
      rotationDeltaRadians: Math.PI / 6
    }
  );

  assert.ok(Math.abs(result.offsetX - 0.3) < 1e-12);
  assert.ok(Math.abs(result.offsetY + 0.3) < 1e-12);
  assert.equal(result.scale, 1.5);
  assert.ok(Math.abs(result.rotationDegrees - 40) < 1e-12);
});

test('weapon review pinch intent uses a dead zone, locks one action, and follows twist direction', () => {
  assert.deepEqual(resolveWeaponReviewPinchGesture(1.02, 0.02), {
    intent: 'pending',
    scaleRatio: 1,
    rotationDeltaRadians: 0
  });
  assert.deepEqual(resolveWeaponReviewPinchGesture(1.15, 0.04), {
    intent: 'scale',
    scaleRatio: 1.15,
    rotationDeltaRadians: 0
  });
  assert.deepEqual(resolveWeaponReviewPinchGesture(1.02, 0.2), {
    intent: 'rotate',
    scaleRatio: 1,
    rotationDeltaRadians: -0.2
  });
  assert.equal(resolveWeaponReviewPinchGesture(1.01, 0.5, 'scale').intent, 'scale');
  assert.equal(resolveWeaponReviewPinchGesture(1.5, 0.01, 'rotate').intent, 'rotate');
});
