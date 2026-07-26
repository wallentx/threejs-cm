const EPSILON = 1e-9;

export function calculateSectionDamage(section, input) {
  const penetrationMm = Number.isFinite(input.penetrationMm)
    ? Math.max(0, input.penetrationMm)
    : 0;
  const penetrated = input.kind === 'blast'
    || penetrationMm + EPSILON >= section.resistanceMm;
  const resistanceScale = section.resistanceMm <= EPSILON
    ? 1
    : Math.min(0.35, penetrationMm / section.resistanceMm * 0.35);
  return {
    penetrated,
    requested: Math.max(0, input.amount) * (penetrated ? 1 : resistanceScale)
  };
}

export function distanceToSection(point, section) {
  if (!Array.isArray(point)) return 0;
  let closest = Number.POSITIVE_INFINITY;
  for (const part of section.colliderParts) {
    const dx = Math.max(0, Math.abs(point[0] - part.center[0]) - part.halfExtents[0]);
    const dy = Math.max(0, Math.abs(point[1] - part.center[1]) - part.halfExtents[1]);
    const dz = Math.max(0, Math.abs(point[2] - part.center[2]) - part.halfExtents[2]);
    closest = Math.min(closest, Math.hypot(dx, dy, dz));
  }
  return Number.isFinite(closest) ? closest : Number.POSITIVE_INFINITY;
}
