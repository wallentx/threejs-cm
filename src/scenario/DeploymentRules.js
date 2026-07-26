// Scenario-independent footprint validation for setup and reinforcement zones.
function unitFootprint(unit) {
  const dimensions = unit?.mesh?.userData?.modelMetadata?.dimensionsMeters;
  return {
    extentX: dimensions?.width
      ? dimensions.width * 0.5
      : (unit?.type === 'infantry_squad' ? 2.2 : 2.5),
    extentZ: dimensions?.length
      ? dimensions.length * 0.5
      : (unit?.type === 'infantry_squad' ? 2.2 : 2.5)
  };
}

export function isPositionInsideDeploymentZone(unit, position, deploymentZones) {
  const zone = deploymentZones?.[unit?.faction];
  if (!zone || !position) return false;
  const { extentX: halfWidth, extentZ: halfLength } = unitFootprint(unit);
  const rotation = unit?.rotation ?? 0;
  // Keep the complete rotated rectangle inside the axis-aligned setup area.
  const extentX = Math.abs(Math.cos(rotation)) * halfWidth
    + Math.abs(Math.sin(rotation)) * halfLength;
  const extentZ = Math.abs(Math.sin(rotation)) * halfWidth
    + Math.abs(Math.cos(rotation)) * halfLength;
  return position.x - extentX >= zone.minX
    && position.x + extentX <= zone.maxX
    && position.z - extentZ >= zone.minZ
    && position.z + extentZ <= zone.maxZ;
}

export function isUnitInsideDeploymentZone(unit, deploymentZones) {
  return isPositionInsideDeploymentZone(unit, unit?.position, deploymentZones);
}

export function findUnitsOutsideDeploymentZones(units, deploymentZones) {
  return units.filter(unit => !isUnitInsideDeploymentZone(unit, deploymentZones));
}
