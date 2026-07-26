import * as THREE from 'three';

export class SupportSystem {
  constructor(scene, combatSystem, random = Math.random) {
    this.scene = scene;
    this.combat = combatSystem;
    this.random = random;

    this.activeMissions = []; // Active artillery / air strikes
  }

  requestFireMission(assetType, spotterUnit, targetPos, parameters = {}) {
    const mission = {
      id: `artillery_${Date.now()}`,
      assetType, // 'mortar81', 'howitzer105', 'p47'
      spotter: spotterUnit,
      targetPos: targetPos.clone(),
      missionType: parameters.missionType || 'MEDIUM', // 'HEAVY', 'MEDIUM', 'LIGHT', 'SMOKE'
      radius: parameters.radius === 'WIDE' ? 120 : (parameters.radius === 'POINT' ? 35 : 75),
      delayTimer: assetType === 'mortar81' ? 10.0 : (assetType === 'howitzer105' ? 20.0 : 25.0), // Delay in seconds
      roundsRemaining: parameters.missionType === 'HEAVY' ? 16 : 10,
      phase: 'SPOTTING', // 'SPOTTING', 'BARRAGE', 'COMPLETE'
      spottingTimer: 0
    };

    this.activeMissions.push(mission);
    return mission;
  }

  update(delta) {
    for (let i = this.activeMissions.length - 1; i >= 0; i--) {
      const m = this.activeMissions[i];

      if (m.delayTimer > 0) {
        m.delayTimer -= delta;
        continue;
      }

      // Spotting / Barrage firing interval
      m.spottingTimer += delta;
      if (m.spottingTimer >= 1.5) {
        m.spottingTimer = 0;

        // Calculate random spread within target radius
        const angle = this.random() * Math.PI * 2;
        const dist = this.random() * m.radius;
        const impactPos = m.targetPos.clone().add(new THREE.Vector3(
          Math.cos(angle) * dist,
          0,
          Math.sin(angle) * dist
        ));

        // Create shell explosion impact
        this.combat.createExplosionEffect(impactPos);

        m.roundsRemaining--;
        if (m.roundsRemaining <= 0) {
          this.activeMissions.splice(i, 1);
        }
      }
    }
  }

  captureState() {
    return this.activeMissions.map(mission => ({
      ...mission,
      spotterId: mission.spotter?.id ?? null,
      spotter: undefined,
      targetPos: mission.targetPos.toArray()
    }));
  }

  restoreState(missions, unitMap) {
    this.activeMissions = missions.map(mission => ({
      ...mission,
      spotter: mission.spotterId ? unitMap.get(mission.spotterId) ?? null : null,
      targetPos: new THREE.Vector3().fromArray(mission.targetPos)
    }));
  }
}
