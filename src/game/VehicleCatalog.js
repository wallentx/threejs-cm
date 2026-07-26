export const VEHICLES = Object.freeze({
  SOMUA_S35: Object.freeze({
    id: 'SOMUA_S35',
    name: 'SOMUA S35',
    crew: Object.freeze([
      Object.freeze({ role: 'COMMANDER_GUNNER', label: 'Commander / Gunner' }),
      Object.freeze({ role: 'DRIVER', label: 'Driver' }),
      Object.freeze({ role: 'RADIO_OPERATOR', label: 'Radio Operator' })
    ]),
    gunnerRoles: Object.freeze(['COMMANDER_GUNNER']),
    loaderRoles: Object.freeze(['COMMANDER_GUNNER']),
    mainGun: Object.freeze({ ap: 'SA35_AP', he: 'SA35_HE' }),
    ammunition: Object.freeze({ ap: 70, he: 48 }),
    turretTraverseRadPerSecond: 0.18,
    hitRadius: 2.35,
    armorMm: Object.freeze({
      hull_front: 40,
      hull_side: 40,
      hull_rear: 35,
      turret_front: 40,
      turret_side: 40,
      turret_rear: 40
    }),
    zoneCrew: Object.freeze({
      hull_front: Object.freeze(['DRIVER', 'RADIO_OPERATOR']),
      hull_side: Object.freeze(['DRIVER', 'RADIO_OPERATOR', 'COMMANDER_GUNNER']),
      hull_rear: Object.freeze(['RADIO_OPERATOR']),
      turret_front: Object.freeze(['COMMANDER_GUNNER']),
      turret_side: Object.freeze(['COMMANDER_GUNNER']),
      turret_rear: Object.freeze(['COMMANDER_GUNNER'])
    })
  }),
  PANZER_III_D: Object.freeze({
    id: 'PANZER_III_D',
    name: 'Panzer III Ausf. D',
    crew: Object.freeze([
      Object.freeze({ role: 'COMMANDER', label: 'Commander' }),
      Object.freeze({ role: 'GUNNER', label: 'Gunner' }),
      Object.freeze({ role: 'LOADER', label: 'Loader' }),
      Object.freeze({ role: 'DRIVER', label: 'Driver' }),
      Object.freeze({ role: 'RADIO_OPERATOR', label: 'Radio Operator' })
    ]),
    gunnerRoles: Object.freeze(['GUNNER']),
    loaderRoles: Object.freeze(['LOADER']),
    mainGun: Object.freeze({ ap: 'KWK36_AP', he: 'KWK36_HE' }),
    ammunition: Object.freeze({ ap: 72, he: 48 }),
    turretTraverseRadPerSecond: 0.25,
    hitRadius: 2.55,
    armorMm: Object.freeze({
      hull_front: 30,
      hull_side: 14.5,
      hull_rear: 14.5,
      turret_front: 30,
      turret_side: 14.5,
      turret_rear: 14.5
    }),
    zoneCrew: Object.freeze({
      hull_front: Object.freeze(['DRIVER', 'RADIO_OPERATOR']),
      hull_side: Object.freeze(['DRIVER', 'RADIO_OPERATOR', 'GUNNER', 'LOADER']),
      hull_rear: Object.freeze(['DRIVER', 'RADIO_OPERATOR']),
      turret_front: Object.freeze(['GUNNER', 'LOADER', 'COMMANDER']),
      turret_side: Object.freeze(['GUNNER', 'LOADER', 'COMMANDER']),
      turret_rear: Object.freeze(['LOADER', 'COMMANDER'])
    })
  })
});

export function vehicleIdForFaction(faction) {
  return faction === 'french' ? 'SOMUA_S35' : 'PANZER_III_D';
}

export function getVehicle(id) {
  return VEHICLES[id] ?? null;
}

export function effectiveArmorMm(nominalArmorMm, impactCosine) {
  return nominalArmorMm / Math.max(0.25, Math.abs(impactCosine));
}

export function penetrationAtVelocity(weapon, velocity) {
  if (!weapon?.penetrationMmAt100m) return 0;
  const ratio = Math.max(0, velocity) / weapon.muzzleVelocity;
  return weapon.penetrationMmAt100m * Math.pow(ratio, weapon.penetrationVelocityExponent ?? 1.35);
}

