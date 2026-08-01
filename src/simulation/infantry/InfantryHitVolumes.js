import {
  intersectSegmentOrientedBox3D
} from '../geometry/OrientedBox.js';

export const INFANTRY_HIT_VOLUME_MODEL_VERSION =
  'stance-compound-obb-v1';

const DATA_QUALITY = [
  'renderer-neutral gameplay approximation',
  'compound volumes follow the authoritative stance and facing',
  'not a skeletal or anatomical wound model'
].join('; ');

const PROFILES = Object.freeze({
  STANDING: Object.freeze({
    aimVolumeId: 'torso',
    volumes: Object.freeze([
      Object.freeze({
        id: 'legs',
        center: Object.freeze([0, 0.46, 0]),
        halfExtents: Object.freeze([0.18, 0.46, 0.15])
      }),
      Object.freeze({
        id: 'pelvis',
        center: Object.freeze([0, 0.91, 0]),
        halfExtents: Object.freeze([0.23, 0.22, 0.16])
      }),
      Object.freeze({
        id: 'torso',
        center: Object.freeze([0, 1.25, 0]),
        halfExtents: Object.freeze([0.26, 0.35, 0.18])
      }),
      Object.freeze({
        id: 'head',
        center: Object.freeze([0, 1.72, 0]),
        halfExtents: Object.freeze([0.17, 0.18, 0.17])
      })
    ])
  }),
  KNEELING: Object.freeze({
    aimVolumeId: 'torso',
    volumes: Object.freeze([
      Object.freeze({
        id: 'legs',
        center: Object.freeze([0, 0.28, 0]),
        halfExtents: Object.freeze([0.24, 0.28, 0.22])
      }),
      Object.freeze({
        id: 'pelvis',
        center: Object.freeze([0, 0.62, 0]),
        halfExtents: Object.freeze([0.24, 0.22, 0.18])
      }),
      Object.freeze({
        id: 'torso',
        center: Object.freeze([0, 1.00, 0]),
        halfExtents: Object.freeze([0.26, 0.34, 0.18])
      }),
      Object.freeze({
        id: 'head',
        center: Object.freeze([0, 1.43, 0]),
        halfExtents: Object.freeze([0.17, 0.18, 0.17])
      })
    ])
  }),
  CROUCHED: Object.freeze({
    aimVolumeId: 'torso',
    volumes: Object.freeze([
      Object.freeze({
        id: 'legs',
        center: Object.freeze([0, 0.33, 0]),
        halfExtents: Object.freeze([0.22, 0.33, 0.19])
      }),
      Object.freeze({
        id: 'pelvis',
        center: Object.freeze([0, 0.70, 0]),
        halfExtents: Object.freeze([0.24, 0.22, 0.18])
      }),
      Object.freeze({
        id: 'torso',
        center: Object.freeze([0, 1.05, 0]),
        halfExtents: Object.freeze([0.26, 0.32, 0.18])
      }),
      Object.freeze({
        id: 'head',
        center: Object.freeze([0, 1.47, 0]),
        halfExtents: Object.freeze([0.17, 0.18, 0.17])
      })
    ])
  }),
  PRONE: Object.freeze({
    aimVolumeId: 'torso',
    volumes: Object.freeze([
      Object.freeze({
        id: 'legs',
        center: Object.freeze([0, 0.27, 0.40]),
        halfExtents: Object.freeze([0.19, 0.18, 0.40])
      }),
      Object.freeze({
        id: 'pelvis',
        center: Object.freeze([0, 0.31, 0.82]),
        halfExtents: Object.freeze([0.23, 0.21, 0.24])
      }),
      Object.freeze({
        id: 'torso',
        center: Object.freeze([0, 0.36, 1.18]),
        halfExtents: Object.freeze([0.27, 0.24, 0.38])
      }),
      Object.freeze({
        id: 'head',
        center: Object.freeze([0, 0.39, 1.70]),
        halfExtents: Object.freeze([0.18, 0.18, 0.18])
      })
    ])
  })
});

function component(point, axis) {
  if (Array.isArray(point)) return Number(point[axis]) || 0;
  return Number(point?.[['x', 'y', 'z'][axis]]) || 0;
}

function normalizeStance(stance) {
  return Object.hasOwn(PROFILES, stance) ? stance : 'STANDING';
}

function worldCenter(position, localCenter, facing) {
  const cosine = Math.cos(facing);
  const sine = Math.sin(facing);
  return [
    component(position, 0)
      + cosine * localCenter[0]
      + sine * localCenter[2],
    component(position, 1) + localCenter[1],
    component(position, 2)
      - sine * localCenter[0]
      + cosine * localCenter[2]
  ];
}

export function getInfantryAimPoint({
  position,
  stance = 'STANDING',
  facing = 0
} = {}) {
  if (!position) return null;
  const profile = PROFILES[normalizeStance(stance)];
  const volume = profile.volumes.find(
    candidate => candidate.id === profile.aimVolumeId
  );
  return {
    point: worldCenter(position, volume.center, Number(facing) || 0),
    hitVolumeId: volume.id,
    modelVersion: INFANTRY_HIT_VOLUME_MODEL_VERSION,
    dataQuality: DATA_QUALITY
  };
}

export function getInfantryHitVolumeRecords({
  position,
  stance = 'STANDING',
  facing = 0
} = {}) {
  if (!position) return [];
  const normalizedFacing = Number(facing) || 0;
  const normalized = normalizeStance(stance);
  return PROFILES[normalized].volumes.map(volume => ({
    id: volume.id,
    stance: normalized,
    center: worldCenter(position, volume.center, normalizedFacing),
    halfExtents: [...volume.halfExtents],
    rotation: normalizedFacing,
    modelVersion: INFANTRY_HIT_VOLUME_MODEL_VERSION,
    dataQuality: DATA_QUALITY
  }));
}

export function intersectInfantryHitVolumes(
  start,
  end,
  {
    position,
    stance = 'STANDING',
    facing = 0
  } = {}
) {
  if (!start || !end || !position) return null;
  const normalizedFacing = Number(facing) || 0;
  const profile = PROFILES[normalizeStance(stance)];
  let closest = null;
  for (const volume of profile.volumes) {
    const center = worldCenter(position, volume.center, normalizedFacing);
    const intersection = intersectSegmentOrientedBox3D(start, end, {
      centerX: center[0],
      centerY: center[1],
      centerZ: center[2],
      halfWidth: volume.halfExtents[0],
      halfHeight: volume.halfExtents[1],
      halfDepth: volume.halfExtents[2],
      rotation: normalizedFacing
    });
    if (!intersection) continue;
    const candidate = {
      ...intersection,
      hitVolumeId: volume.id,
      modelVersion: INFANTRY_HIT_VOLUME_MODEL_VERSION,
      dataQuality: DATA_QUALITY
    };
    if (
      !closest
      || candidate.t < closest.t - 1e-9
      || (
        Math.abs(candidate.t - closest.t) <= 1e-9
        && candidate.hitVolumeId.localeCompare(closest.hitVolumeId) < 0
      )
    ) {
      closest = candidate;
    }
  }
  return closest;
}
