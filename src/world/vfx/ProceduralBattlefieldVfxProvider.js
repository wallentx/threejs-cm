import * as THREE from 'three';
import {
  createProceduralSpriteMaterial
} from './ProceduralVfxNodes.js';

export const PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID =
  'procedural-battlefield-vfx-v2';

function markResource(resource, role) {
  resource.userData.vfxRole = role;
  resource.userData.vfxImplementationId =
    PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID;
  return resource;
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
      new THREE.SphereGeometry(0.13, 7, 5),
      'vehicle-damage-scorch'
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
    scorch: markResource(new THREE.MeshStandardMaterial({
      color: 0x15130f,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.88
    }), 'vehicle-damage-scorch')
  });
  const capacities = Object.freeze({
    smoke: 9,
    flame: 7,
    spark: 14,
    scorch: 8
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
  createVehicleDamageResources
});
