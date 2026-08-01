export const VEHICLE_WEAPON_SELECTION_MODEL_VERSION =
  'vehicle-target-weapon-policy-v1';

export const VEHICLE_TARGET_MODES = Object.freeze({
  AUTO: 'TARGET',
  LIGHT: 'TARGET_LIGHT',
  AP: 'TARGET_AP',
  HE: 'TARGET_HE',
  MACHINE_GUNS: 'TARGET_MG',
  HULL_HE: 'TARGET_HULL_HE',
  HULL_APHE: 'TARGET_HULL_APHE'
});

function availableMainAmmoTypes(vehicleSpec) {
  return {
    ap: Boolean(vehicleSpec?.mainGun?.ap),
    he: Boolean(vehicleSpec?.mainGun?.he)
  };
}

function isArmoredVehicle(target) {
  if (!target?.vehicleSpec) return false;
  if (target.vehicleSpec.explosiveProtection?.class === 'armored_enclosed') {
    return true;
  }
  return Object.values(target.vehicleSpec.armorMm ?? {})
    .some(value => Number(value) > 0);
}

function autoMainAmmoType(target, available) {
  if (target?.vehicleSpec) {
    if (isArmoredVehicle(target)) {
      return available.ap ? 'ap' : (available.he ? 'he' : null);
    }
    return available.he ? 'he' : (available.ap ? 'ap' : null);
  }
  return available.he ? 'he' : (available.ap ? 'ap' : null);
}

export function getVehicleMountCadenceRPM({ mount, state, weapon } = {}) {
  if (!mount?.cadencePolicy) return weapon?.cyclicRPM ?? 0;
  if (state?.loadedType === 'he') {
    const fired = state.roundsFiredByType?.he ?? 0;
    return fired >= mount.cadencePolicy.heReadyRounds
      ? mount.cadencePolicy.sustainedPracticalRPM
      : mount.cadencePolicy.initialPracticalRPM;
  }
  if (state?.loadedType === 'aphe') {
    return mount.cadencePolicy.aphePracticalRPM;
  }
  return mount.cadencePolicy.initialPracticalRPM;
}

/**
 * Chooses weapon systems for one target order. The loaded main-gun round is
 * deliberately not changed here: `mainAmmoType` is the loader's next choice.
 */
export function selectVehicleTargetWeapons({
  mode = VEHICLE_TARGET_MODES.AUTO,
  target = null,
  vehicleSpec = null
} = {}) {
  const available = availableMainAmmoTypes(vehicleSpec);
  const mounts = vehicleSpec?.weaponMounts ?? [];
  const machineGunMountIds = mounts
    .filter(mount => mount.kind !== 'cannon')
    .map(mount => mount.id);
  const hullHeMountIds = mounts
    .filter(mount => mount.targetModes?.includes(VEHICLE_TARGET_MODES.HULL_HE))
    .map(mount => mount.id);
  const hasMachineGuns = machineGunMountIds.length > 0;
  const explicitAmmoType = mode === VEHICLE_TARGET_MODES.AP
    ? 'ap'
    : (mode === VEHICLE_TARGET_MODES.HE ? 'he' : null);
  if (explicitAmmoType) {
    return Object.freeze({
      modelVersion: VEHICLE_WEAPON_SELECTION_MODEL_VERSION,
      mode,
      targetClass: target?.vehicleSpec
        ? (isArmoredVehicle(target) ? 'armored-vehicle' : 'soft-vehicle')
        : (target?.type === 'infantry_squad' ? 'infantry' : 'area'),
      fireMainGun: available[explicitAmmoType],
      fireMachineGuns: false,
      mountIds: Object.freeze([]),
      mountAmmoTypes: Object.freeze({}),
      mainAmmoType: available[explicitAmmoType] ? explicitAmmoType : null
    });
  }
  if (
    mode === VEHICLE_TARGET_MODES.LIGHT
    || mode === VEHICLE_TARGET_MODES.MACHINE_GUNS
  ) {
    return Object.freeze({
      modelVersion: VEHICLE_WEAPON_SELECTION_MODEL_VERSION,
      mode,
      targetClass: target?.vehicleSpec
        ? (isArmoredVehicle(target) ? 'armored-vehicle' : 'soft-vehicle')
        : (target?.type === 'infantry_squad' ? 'infantry' : 'area'),
      fireMainGun: false,
      fireMachineGuns: hasMachineGuns,
      mountIds: Object.freeze([...machineGunMountIds]),
      mountAmmoTypes: Object.freeze({}),
      mainAmmoType: null
    });
  }
  if (
    mode === VEHICLE_TARGET_MODES.HULL_HE
    || mode === VEHICLE_TARGET_MODES.HULL_APHE
  ) {
    const ammoType = mode === VEHICLE_TARGET_MODES.HULL_APHE ? 'aphe' : 'he';
    const selectedMountIds = hullHeMountIds.filter(id =>
      mounts.find(mount => mount.id === id)?.weapons?.[ammoType]
    );
    return Object.freeze({
      modelVersion: VEHICLE_WEAPON_SELECTION_MODEL_VERSION,
      mode,
      targetClass: target?.vehicleSpec
        ? (isArmoredVehicle(target) ? 'armored-vehicle' : 'soft-vehicle')
        : (target?.type === 'infantry_squad' ? 'infantry' : 'area'),
      fireMainGun: false,
      fireMachineGuns: false,
      mountIds: Object.freeze(selectedMountIds),
      mountAmmoTypes: Object.freeze(Object.fromEntries(
        selectedMountIds.map(id => [id, ammoType])
      )),
      mainAmmoType: null
    });
  }

  const targetClass = target?.vehicleSpec
    ? (isArmoredVehicle(target) ? 'armored-vehicle' : 'soft-vehicle')
    : (target?.type === 'infantry_squad'
        ? 'infantry'
        : (target ? 'structure' : 'area'));
  const mainAmmoType = autoMainAmmoType(target, available);
  const fireMachineGuns = hasMachineGuns
    && targetClass === 'infantry';
  return Object.freeze({
    modelVersion: VEHICLE_WEAPON_SELECTION_MODEL_VERSION,
    mode: VEHICLE_TARGET_MODES.AUTO,
    targetClass,
    fireMainGun: Boolean(mainAmmoType),
    fireMachineGuns,
    mountIds: Object.freeze(fireMachineGuns ? [...machineGunMountIds] : []),
    mountAmmoTypes: Object.freeze({}),
    mainAmmoType
  });
}
