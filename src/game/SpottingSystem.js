import * as THREE from 'three';

export class SpottingSystem {
  constructor(scene, terrainBuilder) {
    this.scene = scene;
    this.terrain = terrainBuilder;
    this.raycaster = new THREE.Raycaster();
    this.spottingMap = new Map();
  }

  checkLOS(fromVec3, toVec3) {
    const origin = fromVec3.clone().add(new THREE.Vector3(0, 1.5, 0));
    const target = toVec3.clone().add(new THREE.Vector3(0, 1.2, 0));

    const dir = new THREE.Vector3().subVectors(target, origin);
    const dist = dir.length();
    dir.normalize();

    for (const obs of this.terrain.bocageObstacles) {
      if (this.segmentIntersectsBox(origin, target, obs)) {
        return { clear: false, coverType: obs.type, dist };
      }
    }

    return { clear: true, coverType: 'Open Ground', dist };
  }

  segmentIntersectsBox(p1, p2, box) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    let tMin = 0;
    let tMax = 1;

    const clipAxis = (origin, direction, min, max) => {
      if (Math.abs(direction) < 1e-8) {
        return origin >= min && origin <= max;
      }
      const inv = 1 / direction;
      let near = (min - origin) * inv;
      let far = (max - origin) * inv;
      if (near > far) [near, far] = [far, near];
      tMin = Math.max(tMin, near);
      tMax = Math.min(tMax, far);
      return tMin <= tMax;
    };

    if (!clipAxis(p1.x, dx, box.minX, box.maxX)) return false;
    if (!clipAxis(p1.z, dz, box.minZ, box.maxZ)) return false;

    return true;
  }

  updateSpotting(allUnits, viewerFaction = 'french') {
    const observers = allUnits.filter(unit =>
      unit.faction === viewerFaction &&
      unit.morale !== 'Broken' &&
      unit.roster.some(soldier => soldier.status !== 'KIA')
    );

    allUnits.forEach(unit => {
      if (!unit.mesh) return;
      if (unit.faction === viewerFaction) {
        unit.mesh.visible = true;
        return;
      }

      unit.mesh.visible = observers.some(observer => {
        const baseRange = observer.experience === 'Veteran'
          ? 185
          : observer.experience === 'Crack' ? 210 : 160;
        const concealment = unit.isHiding ? 0.55 : unit.stance === 'PRONE' ? 0.72 : 1;
        const observerPositions = observer.type === 'infantry_squad'
          ? observer.getLivingSoldiers().map(soldier => observer.getSoldierWorldPosition(soldier.id))
          : [observer.position];
        const targetPositions = unit.type === 'infantry_squad' && unit.getLivingSoldiers().length > 0
          ? unit.getLivingSoldiers().map(soldier => unit.getSoldierWorldPosition(soldier.id))
          : [unit.position];

        return observerPositions.some(observerPosition =>
          targetPositions.some(targetPosition => {
            const result = this.checkLOS(observerPosition, targetPosition);
            return result.clear && result.dist <= baseRange * concealment;
          })
        );
      });
    });
  }
}
