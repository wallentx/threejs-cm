import * as THREE from 'three';
import {
  SpriteNodeMaterial
} from 'three/webgpu';
import {
  color,
  float,
  mix,
  smoothstep,
  time,
  uniform,
  uv,
  vec2
} from 'three/tsl';

const CLASSIC_FIRE_DARK = color(0x7d1708);
const CLASSIC_FIRE_ORANGE = color(0xff5a12);
const CLASSIC_FIRE_YELLOW = color(0xffdd55);
const CLASSIC_FIRE_WHITE = color(0xfff4c2);
const SMOKE_DARK = color(0x18191a);
const SMOKE_LIGHT = color(0x5b5a55);

function steppedTime(framesPerSecond) {
  return time.mul(framesPerSecond).floor().div(framesPerSecond);
}

function radialMask(point, radius, feather = 0.05) {
  return smoothstep(radius, radius - feather, point.length());
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
  const frameTime = steppedTime(24);
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
  const frameTime = steppedTime(18);
  const point = uv();
  let density = float(0);
  let shade = float(0);
  const puffs = [
    [0.11, 0.46, 0.19, 0.14],
    [0.34, 0.55, 0.17, 0.18],
    [0.58, 0.43, 0.2, 0.12],
    [0.79, 0.6, 0.18, 0.17],
    [0.93, 0.5, 0.22, 0.1]
  ];
  for (let index = 0; index < puffs.length; index++) {
    const [offset, x, radius, drift] = puffs[index];
    const phase = frameTime.mul(0.12 + index * 0.006).add(offset).fract();
    const center = vec2(
      float(x).add(frameTime.mul(0.55 + index * 0.17).sin().mul(drift)),
      phase.mul(0.88).add(0.05)
    );
    const puffPoint = point.sub(center).mul(vec2(1, 0.78));
    const puff = radialMask(
      puffPoint,
      float(radius).add(phase.mul(0.08)),
      0.08
    ).mul(float(1).sub(phase).mul(0.45).add(0.55));
    density = density.max(puff);
    shade = shade.max(puff.mul(0.35 + index * 0.1));
  }
  material.colorNode = mix(SMOKE_DARK, SMOKE_LIGHT, shade.clamp(0, 1));
  material.opacityNode = density.mul(0.72);
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

  const noise = frameTime.mul(19.7)
    .add(point.x.mul(31.1))
    .add(point.y.mul(47.3))
    .sin()
    .mul(0.045);
  const radius = progress.mul(role === 'explosion' ? 0.44 : 0.28).add(0.08);
  const core = radialMask(point, radius.add(noise), 0.09);
  const ringDistance = point.length().sub(radius).abs();
  const ring = smoothstep(0.075, 0.01, ringDistance);
  const alpha = core.max(ring.mul(0.8)).mul(fade);
  material.colorNode = mix(
    role === 'impact' ? color(0xff9d38) : CLASSIC_FIRE_ORANGE,
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

