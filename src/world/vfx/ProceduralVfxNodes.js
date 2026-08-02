import * as THREE from 'three';
import {
  SpriteNodeMaterial,
  TSL
} from 'three/webgpu';
const {
  color,
  float,
  mix,
  smoothstep,
  time,
  uniform,
  uv,
  vec2
} = TSL;

const CLASSIC_FIRE_DARK = color(0x7d1708);
const CLASSIC_FIRE_ORANGE = color(0xff5a12);
const CLASSIC_FIRE_YELLOW = color(0xffdd55);
const CLASSIC_FIRE_WHITE = color(0xfff4c2);
const SMOKE_DARK = color(0x111211);
const SMOKE_LIGHT = color(0x55534d);

function steppedTime(framesPerSecond) {
  return time.mul(framesPerSecond).floor().div(framesPerSecond);
}

function radialMask(point, radius, feather = 0.05) {
  const radiusNode = float(radius);
  return smoothstep(radiusNode, radiusNode.sub(feather), point.length());
}

function makeMaterial(role, {
  additive = false,
  progress = null
} = {}) {
  const material = new SpriteNodeMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  material.alphaTestNode = float(0.015);
  material.userData.vfxRole = role;
  material.userData.vfxUniforms = Object.freeze({
    ...(progress ? { progress } : {})
  });
  return material;
}

function createFlameMaterial() {
  const material = makeMaterial('vehicle-damage-flame', { additive: true });
  const frameTime = steppedTime(48);
  const point = uv().sub(vec2(0.5, 0.08));
  const height = point.y;
  const sway = frameTime.mul(8.3).add(height.mul(13.7)).sin()
    .mul(0.055)
    .add(frameTime.mul(13.1).add(height.mul(21.3)).cos().mul(0.025));
  const width = float(0.34)
    .mul(float(1).sub(height.clamp(0, 1)))
    .add(frameTime.mul(17).sin().mul(0.025));
  const body = smoothstep(
    width,
    width.sub(0.075),
    point.x.add(sway).abs()
  )
    .mul(smoothstep(-0.04, 0.08, height))
    .mul(smoothstep(0.94, 0.72, height));
  const core = radialMask(
    point.sub(vec2(sway.mul(0.3), 0.15)).mul(vec2(1.8, 1.15)),
    0.34,
    0.12
  ).mul(body);
  const hot = radialMask(
    point.sub(vec2(sway.mul(0.2), 0.09)).mul(vec2(2.6, 1.5)),
    0.27,
    0.1
  ).mul(body);
  material.colorNode = mix(
    mix(CLASSIC_FIRE_DARK, CLASSIC_FIRE_ORANGE, body),
    mix(CLASSIC_FIRE_YELLOW, CLASSIC_FIRE_WHITE, hot),
    core
  );
  material.opacityNode = body.mul(0.96);
  return material;
}

function createSmokeMaterial() {
  const material = makeMaterial('vehicle-damage-smoke');
  const frameTime = steppedTime(24);
  const point = uv().sub(vec2(0.5, 0.02));
  const height = point.y.clamp(0, 1);
  const sway = frameTime.mul(1.9).add(height.mul(7.7)).sin().mul(0.09)
    .add(frameTime.mul(3.1).add(height.mul(13.3)).cos().mul(0.035));
  const turbulence = frameTime.mul(5.7)
    .add(point.x.mul(19.1))
    .add(height.mul(23.7))
    .sin()
    .mul(0.5)
    .add(0.5);
  const edgeNoise = frameTime.mul(4.3)
    .add(height.mul(31.7))
    .sin()
    .mul(0.035)
    .add(turbulence.mul(0.035));
  const width = float(0.24)
    .add(height.mul(0.22))
    .add(edgeNoise);
  const column = smoothstep(
    width,
    width.sub(0.12),
    point.x.add(sway).abs()
  )
    .mul(smoothstep(-0.01, 0.1, point.y))
    .mul(smoothstep(1.02, 0.83, point.y));
  const rollingDensity = column.mul(turbulence.mul(0.46).add(0.38));
  const charcoal = turbulence.mul(0.48).add(height.mul(0.24)).clamp(0, 1);
  material.colorNode = mix(SMOKE_DARK, SMOKE_LIGHT, charcoal);
  material.opacityNode = rollingDensity.mul(0.56);
  return material;
}

function createBurstMaterial(role) {
  const progress = uniform(0);
  const additive = role !== 'impact';
  const material = makeMaterial(role, { additive, progress });
  const point = uv().sub(0.5);
  const frameTime = steppedTime(role === 'muzzleFlash' ? 30 : 24);
  const fade = float(1).sub(progress).clamp(0, 1);

  if (role === 'muzzleFlash') {
    const radial = radialMask(point, float(0.42).mul(fade).add(0.08), 0.12);
    const horizontal = smoothstep(
      0.1,
      0,
      point.y.abs()
    ).mul(smoothstep(0.52, 0.08, point.x.abs()));
    const vertical = smoothstep(
      0.075,
      0,
      point.x.abs()
    ).mul(smoothstep(0.4, 0.06, point.y.abs()));
    const flicker = frameTime.mul(41).sin().mul(0.08).add(0.92);
    const alpha = radial.max(horizontal).max(vertical).mul(fade).mul(flicker);
    material.colorNode = mix(CLASSIC_FIRE_ORANGE, CLASSIC_FIRE_WHITE, radial);
    material.opacityNode = alpha;
    return material;
  }

  if (role === 'explosion') {
    const radius = progress.mul(0.34).add(0.11);
    let fireball = radialMask(point, radius, 0.12);
    const lobes = [
      [-0.2, 0.06, 0.72],
      [0.18, 0.1, 0.78],
      [-0.08, 0.22, 0.66],
      [0.08, -0.18, 0.62],
      [0.26, -0.12, 0.54],
      [-0.25, -0.11, 0.58]
    ];
    for (const [x, y, scale] of lobes) {
      const center = vec2(x, y).mul(progress.mul(0.72).add(0.22));
      fireball = fireball.max(radialMask(
        point.sub(center),
        radius.mul(scale),
        0.11
      ));
    }
    const hotCore = radialMask(
      point.sub(vec2(-0.04, -0.03)),
      radius.mul(0.56),
      0.14
    ).mul(fireball);
    const rolling = frameTime.mul(13.7)
      .add(point.x.mul(17.3))
      .add(point.y.mul(23.9))
      .sin()
      .mul(0.11)
      .add(0.89);
    material.colorNode = mix(
      mix(CLASSIC_FIRE_DARK, CLASSIC_FIRE_ORANGE, fireball),
      CLASSIC_FIRE_WHITE,
      hotCore
    );
    material.opacityNode = fireball.mul(fade).mul(rolling);
    return material;
  }

  const noise = frameTime.mul(19.7)
    .add(point.x.mul(31.1))
    .add(point.y.mul(47.3))
    .sin()
    .mul(0.045);
  const radius = progress.mul(0.28).add(0.08);
  const core = radialMask(point, radius.add(noise), 0.09);
  const ringDistance = point.length().sub(radius).abs();
  const ring = smoothstep(0.075, 0.01, ringDistance);
  const alpha = core.max(ring.mul(0.8)).mul(fade);
  material.colorNode = mix(
    color(0xff9d38),
    CLASSIC_FIRE_WHITE,
    core.mul(fade)
  );
  material.opacityNode = alpha;
  return material;
}

export function createProceduralSpriteMaterial(role) {
  if (role === 'flame') return createFlameMaterial();
  if (role === 'smoke') return createSmokeMaterial();
  if (['impact', 'explosion', 'muzzleFlash', 'blast'].includes(role)) {
    return createBurstMaterial(role === 'blast' ? 'explosion' : role);
  }
  throw new Error(`unknown procedural sprite VFX role ${role}`);
}

export function setProceduralVfxProgress(material, progress) {
  const progressUniform = material?.userData?.vfxUniforms?.progress;
  if (!progressUniform) return false;
  progressUniform.value = THREE.MathUtils.clamp(progress, 0, 1);
  return true;
}
