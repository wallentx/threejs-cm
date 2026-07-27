const requireFactionId = (factionId, label) => {
  if (typeof factionId !== 'string' || factionId.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return factionId;
};

/**
 * Builds immutable faction views without moving authoritative Unit objects.
 * Faction iteration follows registered family order; units inside each view
 * retain scenario/runtime insertion order so fixed-step combat stays stable.
 */
export function buildFactionRosterIndex(factionOrder, units) {
  if (!Array.isArray(factionOrder) || factionOrder.length === 0) {
    throw new TypeError('Faction roster index requires ordered faction ids');
  }
  if (!Array.isArray(units)) {
    throw new TypeError('Faction roster index requires units');
  }

  const orderedFactionIds = factionOrder.map((factionId, index) =>
    requireFactionId(factionId, `Faction id at index ${index}`));
  if (new Set(orderedFactionIds).size !== orderedFactionIds.length) {
    throw new Error('Faction roster index requires unique faction ids');
  }

  const unitsByFaction = new Map(
    orderedFactionIds.map(factionId => [factionId, []])
  );
  for (const unit of units) {
    const factionUnits = unitsByFaction.get(unit?.faction);
    if (!factionUnits) {
      throw new Error(
        `Runtime unit ${unit?.id ?? 'unknown'} has unregistered faction ${unit?.faction ?? 'missing'}`
      );
    }
    factionUnits.push(unit);
  }

  const opposingUnitsByFaction = new Map(
    orderedFactionIds.map(factionId => [
      factionId,
      Object.freeze(units.filter(unit => unit.faction !== factionId))
    ])
  );
  for (const [factionId, factionUnits] of unitsByFaction) {
    unitsByFaction.set(factionId, Object.freeze(factionUnits));
  }

  return Object.freeze({
    factionOrder: Object.freeze(orderedFactionIds),
    unitsFor(factionId) {
      return unitsByFaction.get(factionId) ?? null;
    },
    opposingUnitsFor(factionId) {
      return opposingUnitsByFaction.get(factionId) ?? null;
    }
  });
}
