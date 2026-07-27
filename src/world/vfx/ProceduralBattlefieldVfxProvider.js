import * as THREE from 'three';

export const PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID =
  'procedural-battlefield-vfx-v1';

function markResource(resource, role) {
  resource.userData.vfxRole = role;
  resource.userData.vfxImplementationId =
    PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID;
  return resource;
}

function createCombatResources() {
  const effectGeometries = Object.freeze({
    impact: markResource(new THREE.SphereGeometry(0.16, 6, 5), 'combat-impact'),
    explosion: markResource(
      new THREE.SphereGeometry(2.5, 12, 12),
      'combat-explosion'
    )
  });
  const styles = Object.freeze({
    impact: Object.freeze({
      color: 0xffb347,
      initialOpacity: 0.9,
      maxLife: 0.18,
      growthPerSecond: 2.4
    }),
    explosion: Object.freeze({
      color: 0xff4500,
      initialOpacity: 0.9,
      maxLife: 0.6,
      growthPerSecond: 2.4
    })
  });
  const effectCaps = Object.freeze({ impact: 48, explosion: 12 });
  const projectileResources = new Map();
  let disposed = false;
  return Object.freeze({
    kind: 'combat-vfx-resources',
    effectGeometries,
    effectCaps,
    styles,
    createEffectMaterial(kind) {
      const style = styles[kind];
      if (!style) throw new Error(`unknown combat VFX role ${kind}`);
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
      new THREE.SphereGeometry(0.34, 7, 6),
      'vehicle-damage-smoke'
    ),
    flame: markResource(
      new THREE.ConeGeometry(0.19, 0.72, 6, 1),
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
    smoke: markResource(new THREE.MeshBasicMaterial({
      color: 0x262522,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    }), 'vehicle-damage-smoke'),
    flame: markResource(new THREE.MeshBasicMaterial({
      color: 0xff641c,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }), 'vehicle-damage-flame'),
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
      return markResource(new THREE.MeshBasicMaterial({
        color: 0xff8a24,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }), 'vehicle-damage-blast');
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
