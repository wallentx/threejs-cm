function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Derive fixed-step vehicle blockers from authoritative unit transforms.
 *
 * These records are transient collision inputs. They never own position,
 * movement, damage, capture/restore state, or renderer visibility.
 */
export function createDynamicVehicleCollisionRecords(units) {
  return [...(units ?? [])]
    .filter(unit => unit?.vehicleSpec?.dimensionsMeters)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .map(unit => {
      const dimensions = unit.vehicleSpec.dimensionsMeters;
      return {
        id: `dynamic-vehicle:${unit.id}`,
        unitId: String(unit.id),
        type: 'vehicle',
        centerX: finite(unit.position?.x),
        centerZ: finite(unit.position?.z),
        halfX: Math.max(0.1, finite(dimensions.width, 1) * 0.5),
        halfZ: Math.max(0.1, finite(dimensions.length, 1) * 0.5),
        rotation: finite(unit.rotation),
        blocks: ['vehicle'],
        dataQuality:
          'fixed-step oriented rigid-envelope blocker; dynamic impulse and suspension coupling are not modeled'
      };
    });
}

export function collisionRecordsForVehicle(records, vehicleId) {
  const stableId = String(vehicleId);
  return (records ?? []).filter(record => record.unitId !== stableId);
}
