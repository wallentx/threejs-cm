import * as THREE from 'three';
import {
  createProceduralSpriteMaterial
} from './ProceduralVfxNodes.js';
import {
  createThreeVfxBattlefieldRuntime
} from './ThreeVfxBattlefieldRuntime.js';

export const PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID =
  'procedural-battlefield-vfx-v2';

function markResource(resource, role) {
  resource.userData.vfxRole = role;
  resource.userData.vfxImplementationId =
    PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID;
  return resource;
}

function createRadialMarkGeometry(radius, rings) {
  const segments = 28;
  const positions = [];
  const colors = [];
  const indices = [];

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex];
    for (let segment = 0; segment < segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const irregularity = ringIndex === 0
        ? 1
        : 1
          + Math.sin(angle * 3 + ringIndex * 1.7) * 0.055
          + Math.cos(angle * 7 - ringIndex * 0.9) * 0.035;
      positions.push(
        Math.cos(angle) * radius * ring.radius * irregularity,
        Math.sin(angle) * radius * ring.radius * irregularity,
        0
      );
      colors.push(ring.value, ring.value, ring.value, ring.alpha);
    }
  }
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex++) {
    const innerStart = ringIndex * segments;
    const outerStart = (ringIndex + 1) * segments;
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      indices.push(
        innerStart + segment,
        outerStart + segment,
        outerStart + next,
        innerStart + segment,
        outerStart + next,
        innerStart + next
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(colors, 4)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createImpactMarkGeometry() {
  return createRadialMarkGeometry(0.055, Object.freeze([
    { radius: 0, value: 0.06, alpha: 0.98 },
    { radius: 0.28, value: 0.12, alpha: 0.98 },
    { radius: 0.48, value: 1, alpha: 0.9 },
    { radius: 0.76, value: 0.34, alpha: 0.42 },
    { radius: 1, value: 0.1, alpha: 0 }
  ]));
}

function createHeScorchGeometry() {
  return createRadialMarkGeometry(0.07, Object.freeze([
    { radius: 0, value: 0.42, alpha: 0.28 },
    { radius: 0.24, value: 0.24, alpha: 0.48 },
    { radius: 0.58, value: 0.62, alpha: 0.34 },
    { radius: 0.82, value: 0.28, alpha: 0.18 },
    { radius: 1, value: 0.12, alpha: 0 }
  ]));
}

// Renderer-only gameplay approximations. These colors, lifetimes, scales, and
// shard behavior distinguish debris at a glance; they are not historical
// evidence or authoritative building-material properties.
const BUILDING_DEBRIS_MATERIAL_STYLES = Object.freeze({
  masonry: Object.freeze({
    id: 'masonry',
    color: 0xa58f73,
    initialOpacity: 0.94,
    maxLife: 0.9,
    growthPerSecond: 0.7,
    initialScale: 0.82
  }),
  timber: Object.freeze({
    id: 'timber',
    color: 0x795333,
    initialOpacity: 0.92,
    maxLife: 1.05,
    growthPerSecond: 0.55,
    initialScale: 0.76
  }),
  roofTile: Object.freeze({
    id: 'roof-tile',
    color: 0x8f4634,
    initialOpacity: 0.95,
    maxLife: 0.82,
    growthPerSecond: 0.82,
    initialScale: 0.72
  }),
  mixed: Object.freeze({
    id: 'mixed',
    color: 0x8c6f52,
    initialOpacity: 0.93,
    maxLife: 0.98,
    growthPerSecond: 0.62,
    initialScale: 0.8
  }),
  fallback: Object.freeze({
    id: 'fallback',
    color: 0x77736c,
    initialOpacity: 0.9,
    maxLife: 0.86,
    growthPerSecond: 0.6,
    initialScale: 0.74
  })
});

const BUILDING_DEBRIS_SEVERITY_SCALE = Object.freeze({
  damaged: 0.72,
  breached: 1,
  collapsed: 1.38
});

const BUILDING_DEBRIS_RESOLVED_STYLES = Object.freeze(
  Object.fromEntries(
    Object.entries(BUILDING_DEBRIS_MATERIAL_STYLES).map(([family, style]) => [
      family,
      Object.freeze(Object.fromEntries(
        Object.entries(BUILDING_DEBRIS_SEVERITY_SCALE).map(
          ([severity, scale]) => [
            severity,
            Object.freeze({
              ...style,
              severity,
              initialScale: style.initialScale * scale,
              maxLife: style.maxLife * (0.85 + scale * 0.15)
            })
          ]
        )
      ))
    ])
  )
);

function buildingDebrisMaterialFamily(materialLabel) {
  const label = String(materialLabel ?? '').trim().toLowerCase();
  const hasTile = label.includes('tile') || label.includes('roof');
  const hasTimber = label.includes('timber') || label.includes('wood');
  const hasMasonry = label.includes('masonry')
    || label.includes('stone')
    || label.includes('brick');
  if (hasTile) return 'roofTile';
  if (label.includes('mixed') || (hasTimber && hasMasonry)) return 'mixed';
  if (hasMasonry) return 'masonry';
  if (hasTimber) return 'timber';
  return 'fallback';
}

function resolveBuildingDebrisStyle(materialLabel, severity = 'damaged') {
  const family = buildingDebrisMaterialFamily(materialLabel);
  const severityKey = Object.hasOwn(BUILDING_DEBRIS_SEVERITY_SCALE, severity)
    ? severity
    : 'damaged';
  return BUILDING_DEBRIS_RESOLVED_STYLES[family][severityKey];
}

function createCombatResources() {
  const effectGeometries = Object.freeze({
    impact: markResource(new THREE.PlaneGeometry(1, 1), 'combat-impact'),
    explosion: markResource(
      new THREE.PlaneGeometry(1, 1),
      'combat-explosion'
    ),
    muzzleFlash: markResource(
      new THREE.PlaneGeometry(1, 1),
      'combat-muzzle-flash'
    ),
    buildingDebris: markResource(
      new THREE.TetrahedronGeometry(0.34, 0),
      'combat-building-debris'
    )
  });
  const styles = Object.freeze({
    impact: Object.freeze({
      color: 0xffb347,
      initialOpacity: 0.9,
      maxLife: 0.18,
      growthPerSecond: 2.4,
      initialScale: 1
    }),
    explosion: Object.freeze({
      color: 0xff4500,
      initialOpacity: 0.9,
      maxLife: 0.6,
      growthPerSecond: 2.4,
      // Impact call sites pass blast-relative factors around 0.55-0.7. The
      // former sphere was five metres wide; preserve that visible scale after
      // moving presentation to a unit-sized sprite.
      initialScale: 4.5
    }),
    muzzleFlash: Object.freeze({
      color: 0xffd166,
      initialOpacity: 1,
      maxLife: 0.055,
      growthPerSecond: 5.5,
      initialScale: 1
    }),
    buildingDebris: BUILDING_DEBRIS_MATERIAL_STYLES.fallback
  });
  const effectCaps = Object.freeze({
    impact: 48,
    explosion: 12,
    muzzleFlash: 48,
    buildingDebris: 24
  });
  const projectileResources = new Map();
  let disposed = false;
  return Object.freeze({
    kind: 'combat-vfx-resources',
    effectGeometries,
    effectCaps,
    styles,
    resolveBuildingDebrisStyle,
    createEffectMaterial(kind) {
      const style = styles[kind];
      if (!style) throw new Error(`unknown combat VFX role ${kind}`);
      if (kind !== 'buildingDebris') {
        return markResource(
          createProceduralSpriteMaterial(kind),
          `combat-${kind}`
        );
      }
      return markResource(new THREE.MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false
      }), `combat-${kind}`);
    },
    createProjectileMesh(weapon) {
      const isCannon = weapon.kind.startsWith('cannon');
      const key = `${isCannon ? 'cannon' : 'small-arm'}:${weapon.caliberMm}`;
      let resource = projectileResources.get(key);
      if (!resource) {
        const geometry = isCannon
          ? new THREE.SphereGeometry(
              Math.max(0.07, weapon.caliberMm / 450),
              6,
              5
            )
          : new THREE.CylinderGeometry(0.014, 0.014, 0.44, 5);
        if (!isCannon) geometry.rotateX(Math.PI / 2);
        resource = Object.freeze({
          geometry: markResource(geometry, `projectile-${key}`),
          material: markResource(new THREE.MeshBasicMaterial({
            color: isCannon ? 0xffd166 : 0xffb347,
            toneMapped: false
          }), `projectile-${key}`)
        });
        projectileResources.set(key, resource);
      }
      return markResource(
        new THREE.Mesh(resource.geometry, resource.material),
        `projectile-${key}`
      );
    },
    resetProjectileResources() {
      const count = projectileResources.size;
      for (const resource of projectileResources.values()) {
        resource.geometry.dispose();
        resource.material.dispose();
      }
      projectileResources.clear();
      return count;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      for (const geometry of Object.values(effectGeometries)) geometry.dispose();
      for (const resource of projectileResources.values()) {
        resource.geometry.dispose();
        resource.material.dispose();
      }
      projectileResources.clear();
      return true;
    }
  });
}

function createVehicleDamageResources() {
  const geometries = Object.freeze({
    smoke: markResource(
      new THREE.PlaneGeometry(1, 1),
      'vehicle-damage-smoke'
    ),
    flame: markResource(
      new THREE.PlaneGeometry(1, 1),
      'vehicle-damage-flame'
    ),
    spark: markResource(
      new THREE.TetrahedronGeometry(0.055, 0),
      'vehicle-damage-spark'
    ),
    scorch: markResource(
      createImpactMarkGeometry(),
      'vehicle-damage-scorch'
    ),
    heScorch: markResource(
      createHeScorchGeometry(),
      'vehicle-damage-he-scorch'
    ),
    blast: markResource(
      new THREE.IcosahedronGeometry(1, 2),
      'vehicle-damage-blast'
    )
  });
  const materials = Object.freeze({
    smoke: markResource(
      createProceduralSpriteMaterial('smoke'),
      'vehicle-damage-smoke'
    ),
    flame: markResource(
      createProceduralSpriteMaterial('flame'),
      'vehicle-damage-flame'
    ),
    spark: markResource(new THREE.MeshBasicMaterial({
      color: 0xffc35a,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }), 'vehicle-damage-spark'),
    scorch: markResource(new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }), 'vehicle-damage-scorch'),
    heScorch: markResource(new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }), 'vehicle-damage-he-scorch')
  });
  const capacities = Object.freeze({
    smoke: 8,
    flame: 12,
    spark: 24,
    scorch: 8,
    heScorch: 8
  });
  let disposed = false;
  return Object.freeze({
    kind: 'vehicle-damage-vfx-resources',
    geometries,
    materials,
    capacities,
    createBlastMaterial() {
      return markResource(
        createProceduralSpriteMaterial('blast'),
        'vehicle-damage-blast'
      );
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      return true;
    }
  });
}

export const PROCEDURAL_BATTLEFIELD_VFX_PROVIDER = Object.freeze({
  id: PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID,
  kind: 'battlefield-vfx-provider',
  createCombatResources,
  createVehicleDamageResources,
  createRuntime(options) {
    return createThreeVfxBattlefieldRuntime(options);
  }
});
