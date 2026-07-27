export const OBSERVATION_EQUIPMENT = Object.freeze({
  BINOCULARS: 'BINOCULARS',
  RADIO: 'RADIO'
});

export function isLivingObserver(person) {
  if (!person) return false;
  if ((person.health ?? 100) <= 0) return false;
  return !['KIA', 'INCAPACITATED', 'DEAD'].includes(person.status);
}

function addEquipment(target, values) {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value === 'string') target.add(value.toUpperCase());
  }
}

export function equipmentForObserver(unit, person, profile = null) {
  const equipment = new Set();
  const effectiveRole = typeof unit?.getEffectiveCrewRole === 'function'
    ? unit.getEffectiveCrewRole(person)
    : person?.role;
  addEquipment(equipment, person?.equipment);
  addEquipment(equipment, profile?.equipment);
  addEquipment(equipment, profile?.soldierEquipment?.[person?.id]);
  addEquipment(equipment, profile?.equipmentByRole?.[effectiveRole]);

  const vehicleEquipment = unit?.vehicleSpec?.observationEquipment;
  if (vehicleEquipment?.binocularRoles?.includes(effectiveRole)) {
    equipment.add(OBSERVATION_EQUIPMENT.BINOCULARS);
  }
  if (vehicleEquipment?.radioOperatorRoles?.includes(effectiveRole)) {
    equipment.add(OBSERVATION_EQUIPMENT.RADIO);
  }
  return equipment;
}

export function observerHasEquipment(unit, person, equipmentId, profile = null) {
  return equipmentForObserver(unit, person, profile).has(equipmentId);
}
