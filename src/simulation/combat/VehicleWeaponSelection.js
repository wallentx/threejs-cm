export const VEHICLE_WEAPON_SELECTION_MODEL_VERSION =
  'vehicle-target-weapon-policy-v1';

export const VEHICLE_TARGET_MODES = Object.freeze({
  AUTO: 'TARGET',
  LIGHT: 'TARGET_LIGHT',
  AP: 'TARGET_AP',
  HE: 'TARGET_HE',
  MACHINE_GUNS: 'TARGET_MG'
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
  const hasMachineGuns = (vehicleSpec?.weaponMounts?.length ?? 0) > 0;
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
    mainAmmoType
  });
}
